# LudoTool

Outil interne de gestion d'une ludothèque : suivi du parc de jeux, préparation
des nouveautés, planning de l'équipe, réservations de postes de jeux vidéo et
préparation des commandes.

Application Next.js déployée sur Cloudflare Workers, avec une base D1 pour
toutes les données.

---

## Sommaire

- [Démarrer](#démarrer)
- [Les sections de l'application](#les-sections-de-lapplication)
- [Architecture](#architecture)
- [Base de données](#base-de-données)
- [Les comptes](#les-comptes)
- [Les paniers communs : votes et vérification](#les-paniers-communs--votes-et-vérification)
- [Sources externes](#sources-externes)
- [Déploiement](#déploiement)
- [Conventions de code](#conventions-de-code)

---

## Démarrer

```bash
npm install
npm run dev            # http://localhost:3000
```

`next dev` monte une D1 **locale** (vide) via `initOpenNextCloudflareForDev`
(voir `instrumentation.ts`). Les tables ne sont pas créées automatiquement : sans
schéma local, les routes API répondent 500 et les pages s'affichent vides. Pour
travailler sur des données, créer les tables puis insérer un jeu d'essai :

```bash
npx wrangler d1 execute ludotool-db --local --file ./mon-seed.sql
```

Variables d'environnement (fichier `.dev.vars`, voir `.dev.vars.example`) :

| Variable | Usage |
| --- | --- |
| `TWITCH_CLIENT_ID` | Authentification IGDB (fiches de jeux vidéo) |
| `TWITCH_CLIENT_SECRET` | Idem |

En production, ce sont des secrets Cloudflare (`wrangler secret put …`).

### Scripts npm

| Script | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Build Next.js |
| `npm run lint` | ESLint |
| `npm run preview` | Build OpenNext + aperçu dans le runtime Workers |
| `npm run deploy` | Build OpenNext + déploiement Cloudflare |
| `npm run cf-typegen` | Régénère `cloudflare-env.d.ts` depuis `wrangler.jsonc` |

---

## Les sections de l'application

| Page | Rôle |
| --- | --- |
| `/` | Tableau de bord : présences du jour, alertes, puis des modules au choix (nouveautés, réservations JV, atelier…) |
| `/inventaire` | Parc de jeux : recherche, fiches, statuts, doubles |
| `/atelier` | Jeux en préparation et étapes (plastification, contenu, étiquette, équipement, encodage, notice), réceptions de commandes |
| `/agenda` | Planning de l'équipe : horaires, absences, événements, échanges de jours, PDF |
| `/reunion` | Vie de l'équipe (Bureau) : événements à venir, points à aborder, missions priorisées, événements (préparation, passés et retours), réunions et comptes rendus |
| `/store` | Paniers d'achat (jeux de société, jeux vidéo, jouets), commandes communes, devis PDF |
| `/catalogage` | Attribution des codes Syracuse |
| `/jv` | Jeux vidéo : catalogue, sélections par console, rotations, réservations de postes, stats, notes |
| `/suggestions` | Boîte à idées interne — auteur affiché si posté connecté, pastille des nouvelles suggestions pour Timothé seul (`lib/suggestions.ts`), réponses des comptes connectés avec notification de l'auteur |
| `/connexion` | Connexion à son compte (facultative, voir *Les comptes*) |
| `/contenu`, `/etiquettes` | Génération des fiches de contenu et des étiquettes (PDF) |
| `/pieces`, `/reparations` | Pièces manquantes ou retrouvées, réparations |
| `/nouveautes`, `/export` | Mise en avant des nouveautés, exports |

### Deux notions à connaître avant de toucher au code

**Les rotations de sélection (`/jv`).** Quatre emplacements tournent, une console
par semaine : `PS5 → Switch Multi → Switch Solo → PC`. Chaque emplacement a une
sélection active (3 jeux) et une file de groupes de 3 jeux à venir. Valider une
rotation installe le premier groupe en attente de l'emplacement suivant.

`jv_rotation_config` ne retient que l'emplacement en place (`current_slot_index`)
et la semaine où la rotation a été actée (`week_start`, purement informatif, sert
à signaler un retard). **Le planning se cale toujours sur la semaine réelle en
cours** : il n'y a pas de date de départ à maintenir.

Conséquence importante : `jv_selections` ne contient que le présent (sélection en
cours + groupes planifiés). Les lignes sont supprimées à chaque rotation, donc
**il n'existe aucun historique des sélections passées**. Tout ce qui ressemble à
« ce jeu est déjà passé » se déduit des réservations (`jv_reservations`), seule
trace durable.

**Les étapes de préparation (`/atelier`).** Un jeu entre en `En préparation`,
passe par les étapes `etape_*` de la table `jeux`, puis passe `En stock`.

---

## Architecture

```
app/
  <section>/page.tsx     Pages (composants clients, état local, appels fetch)
  api/<ressource>/       Routes API : GET/POST sur la collection,
    route.ts             GET/PUT/DELETE sur /[id]
components/              NavBar et générateurs PDF
lib/db.ts                Accès D1 via getCloudflareContext()
migrations/              SQL appliqué à la main sur D1
scripts/                 Scripts de réparation de données, ponctuels
```

Il n'y a ni ORM ni couche de service : les routes API construisent le SQL
directement, et les pages appellent `fetch` sur ces routes. Les composants sont
stylés en CSS inline avec les variables de `app/globals.css` (`--ink`, `--cream`,
`--bleu`…) et les classes utilitaires `pop-*` (`pop-card`, `pop-btn`,
`pop-sticker`, `pop-input`).

### Piège à connaître : la limite de paramètres D1

**D1 accepte au maximum 100 paramètres liés par requête.** Une clause
`ean IN (?, ?, …)` construite depuis une liste d'EAN échoue silencieusement
au-delà (la route renvoie 500, l'appelant `catch` et affiche une liste vide).
`/api/catalogue` et `/api/jeux` découpent donc la liste en lots de 80. Toute
nouvelle requête bâtie sur une liste doit faire pareil.

---

## Base de données

Base D1 `ludotool-db` (binding `DB`). Les PDF des règles de jeux sont dans le
bucket R2 `ludotool-regles` (binding `REGLES`), un objet `regles/<ean>.pdf` par
jeu, servi par `/api/regles/[ean]` ; `catalogue.pdf_url` pointe vers cette route.

| Table | Contenu |
| --- | --- |
| `jeux` | Exemplaires physiques : statut, étapes de préparation, code Syracuse, notes |
| `catalogue` | Fiche par EAN : nom, éditeur, image, couleur de pastille, mécanique, contenu… |
| `editeurs` | Éditeurs |
| `commandes` | Réceptions de commandes |
| `equipe`, `evenements`, `planning_semaine`, `planning_blocs` | Agenda : membres, horaires, absences, planning, blocs spéciaux du planning |
| `paniers`, `panier_lignes` | Paniers d'achat |
| `paniers_communs_lignes` | Lignes des commandes communes (`votes` = cache du score) |
| `paniers_communs_votes`, `paniers_communs_commentaires` | Votes nominatifs et commentaires sur ces lignes |
| `jv_jeux`, `jv_selections`, `jv_reservations`, `jv_rotation_config`, `jv_notes` | Section jeux vidéo |
| `pieces_manquantes`, `pieces_trouvees`, `reparations` | Suivi du matériel |
| `pieces_detachees` | Stock de pièces de rechange, rangées par jeu |
| `alertes`, `suggestions`, `selections` | Alertes, boîte à idées, sélections thématiques |
| `utilisateurs`, `utilisateur_sessions` | Comptes (un par membre de `equipe`) et sessions ouvertes |
| `utilisateur_preferences` | Modules choisis sur le tableau de bord, par compte |
| `suggestions_commentaires` | Réponses aux suggestions ; `lu_par_auteur` alimente la pastille de l'auteur |
| `reunion_fiches`, `reunion_evenements`, `reunion_seances`, `reunion_retours` | Page Réunion : points et missions, événements en préparation, séances et comptes rendus, retours sur événement |

Les migrations de `migrations/` sont appliquées manuellement :

```bash
npx wrangler d1 execute ludotool-db --remote --file ./migrations/0007_suggestions.sql
```

---

## Les comptes

Chaque membre de `equipe` a un compte dans `utilisateurs`, identifié par son
prénom sans accent (`bernard`, `elisabeth`, `lea`, `pierre`, `timothe`, plus
`nouveau` pour le membre ajouté par `0014_nouveau_membre.sql`). La
saisie est tolérante : « Léa » et « lea » ouvrent le même compte.

**La connexion est facultative.** Aucune page n'est protégée : l'outil s'utilise
exactement comme avant sans être connecté. Le compte sert à savoir *qui* agit,
pour les écrans qui en auront besoin. Ce choix est structurant — le jour où une
page doit être réservée, c'est à elle de le décider, pas à un middleware global.

- **Mot de passe par défaut : `ludo92`**, avec `doit_changer_mdp = 1`. À la
  première connexion, `AuthProvider` impose un nouveau mot de passe avant toute
  autre action ; la seule autre issue est la déconnexion.
- **Empreintes** : PBKDF2-SHA256, 50 000 itérations, sel aléatoire par mot de
  passe, au format `pbkdf2$<iterations>$<sel b64>$<empreinte b64>`. Le nombre
  d'itérations est stocké dans l'empreinte : l'augmenter plus tard n'invalide pas
  les mots de passe existants. 50 000 est un compromis assumé avec le temps CPU
  d'un Worker (~7 ms).
- **Sessions** : le cookie `ludotool_session` (HttpOnly, SameSite=Lax) ne porte
  qu'un jeton opaque ; tout l'état est dans `utilisateur_sessions`, ce qui rend
  une session révocable en base. Durée 30 jours, purge des expirées à chaque
  connexion.

Côté client, `components/AuthProvider.tsx` expose `useCompte()` :
`{ compte, chargement, connexion, deconnexion, changerMotDePasse }`. `compte`
vaut `null` hors connexion — c'est un état normal, pas une erreur.

### Les modules du tableau de bord

L'agenda et les alertes sont fixes. Le reste de l'accueil est une liste de
modules (`components/ModulesAccueil.tsx`, registre `MODULES`) : nouveautés en
salle, réservations jeux vidéo, jeux en préparation, réparations, pièces
manquantes, boîte à idées. Hors connexion, c'est la présentation par défaut
(`MODULES_PAR_DEFAUT`, les nouveautés seules). Connecté, chacun choisit et
ordonne ses modules via « Personnaliser », enregistrés dans
`utilisateur_preferences.accueil_modules` (tableau JSON d'identifiants, route
`/api/auth/preferences`). Un identifiant inconnu est ignoré à la lecture :
retirer un module du registre ne casse aucun compte.

**Réinitialiser un mot de passe oublié** (il n'y a pas encore d'écran pour ça) :

```bash
# remet « ludo92 » et réimpose le changement à la prochaine connexion
npx wrangler d1 execute ludotool-db --remote --command   "UPDATE utilisateurs SET mot_de_passe_hash = (SELECT mot_de_passe_hash FROM utilisateurs WHERE doit_changer_mdp = 1 LIMIT 1), doit_changer_mdp = 1 WHERE identifiant = 'lea'"
```

Si plus aucun compte n'est au mot de passe par défaut, reprendre l'empreinte
littérale depuis `migrations/0008_utilisateurs.sql`.

---

## La page Réunion

Trois objets, trois tables :

- **Les fiches** (`reunion_fiches`) : un seul modèle pour les *points à aborder*
  et les *missions*, distingués par `genre`. Un point abordé en réunion devient
  souvent une mission : la conversion change le genre sans rien perdre. Priorité
  de 0 (basse) à 3 (urgente), deadline facultative, membres assignés. Les
  missions sont triées : en retard d'abord, puis par priorité, puis par échéance.
- **Les événements en préparation** (`reunion_evenements`) : volontairement
  distincts de `evenements` (l'agenda). Un projet peut exister sans date, porter
  ses missions de préparation, et n'apparaît au planning que quand on clique
  « Ajouter à l'agenda » ; `agenda_id` garde alors le lien pour les mises à jour
  (recréé si la copie a été supprimée côté agenda). Les responsables y deviennent
  les membres de l'événement : un créneau horaire compte donc dans leurs heures,
  comme un événement saisi directement dans l'agenda.
- **Les retours sur événement** (`reunion_retours`) : un par événement passé
  (ressenti sur 5, fréquentation, « à refaire ? », ce qui a marché, à
  améliorer, idées pour la prochaine fois). L'onglet *Événements › Passés*
  liste les événements du Bureau terminés, annulés ou dont la date est
  dépassée, **et ceux de l'agenda sans fiche au Bureau** (hors réunions).
  Écrire le retour d'un événement de l'agenda l'importe d'abord dans
  `reunion_evenements` (statut `termine`, `agenda_id` renseigné) : un retour
  porte toujours sur une ligne du Bureau. Écrire un retour passe aussi
  l'événement à `termine`. Les événements passés depuis moins de deux mois et
  sans retour sont proposés à l'ordre du jour des réunions.
- **Les séances** (`reunion_seances`) : une seule en cours à la fois. Lancer une
  réunion avec un ordre du jour vide propose des points tirés des données
  (missions en retard, urgentes ou sans responsable, événements proches ou à
  dater, bilans, missions terminées depuis la dernière séance). Les fiches
  traitées en séance gardent `seance_id`, ce qui reconstitue le compte rendu
  sans le recopier dans les notes libres.

**Créer demande d'être connecté** (fiches, événements, séances, copie dans
l'agenda : les `POST` répondent 401 sinon) ; consulter et modifier restent
ouverts, pour qu'une réunion avance depuis n'importe quel poste. C'est une
exception assumée au principe « connexion facultative » des comptes.

**Le compte rendu** (`reunion_seances.compte_rendu`) est un tableau JSON de
blocs `{ "t": "section" | "p", "texte": … }`. La liste des comptes rendus n'en
montre que les titres de section ; le détail affiche tout. Un texte qui n'est
pas ce JSON (notes saisies avant les sections) se lit comme un paragraphe
unique. La recherche se fait côté client, sur les notes, le titre, les présents
et les points et missions rattachés, sans tenir compte des accents ni de la casse.

Les routes `/api/reunion/*` n'écrivent que les colonnes listées dans
`lib/reunion.ts`, contrairement aux routes génériques plus anciennes qui
reprennent telles quelles les clés du corps de la requête.

---

## Le planning de la semaine (`/agenda`)

L'éditeur de planning se pilote au glisser-déposer. Deux garde-fous s'appliquent
à un membre de l'équipe (pas aux vacataires, qui n'ont pas d'horaires) :

- **Absent ce jour-là** (congé, RTT, récup, formation) : le dépôt est refusé.
- **Hors de ses horaires** : pendant le glisser, ce qui sort de ses horaires
  apparaît en rouge. Ses horaires, c'est son planning A/B (échanges compris),
  moins ses absences à l'heure, plus les événements à horaires où il figure.
  Déposer dessus demande confirmation ; confirmer crée dans l'agenda des
  « Heures Exceptionnelles » pour la seule partie hors horaires, ce qui les
  compte dans ses heures.

Ces heures supp. ont pour identifiant `hs-<id du créneau>-<membre>-<n>` : c'est
ce qui les relie au créneau sans table de liaison. Retirer le membre ou
supprimer le créneau les supprime, redimensionner le créneau les ajuste (et
redemande confirmation s'il déborde davantage). Dans l'autre sens, supprimer
ces heures supp. depuis l'agenda retire le membre du créneau : c'est la route
`DELETE /api/evenements/[id]` qui s'en charge, sauf quand l'appel vient du
planning lui-même (`?depuis=planning`, quand il ajuste ses heures supp.). Une ⭐ sur l'initiale signale un
membre placé en heures supp. La copie de créneaux vers une autre semaine ne
crée pas d'heures supp. : à vérifier après coup.

### Blocs spéciaux et sous-effectif

À côté de la salle principale, le planning place des **blocs spéciaux**
(jeux vidéo, animations…), décrits par des modèles dans `planning_blocs` et
gérés depuis le bouton « Blocs » du planning : nom, icône, couleur, personnes
nécessaires, répétition (chaque semaine, semaines A, semaines B ou date unique),
période facultative, et des horaires par jour. Le bloc « Jeux vidéo » (id `jv`)
est le premier modèle, créé par `0020_planning_blocs.sql` avec les horaires qui
étaient codés en dur.

Un bloc peut être **lié à un événement de l'agenda** (`evenement_id`, migration
0021) : il suit alors ses dates et ses horaires (ou les siens si l'événement
n'en a pas) au lieu de sa répétition, et se déplace avec lui. Pour une série
récurrente, c'est son `parent_id` qui est retenu : l'agenda recrée les
occurrences d'une série quand on la modifie, l'identifiant de série reste.

Dans une semaine (`planning_semaine.slots`), un créneau de bloc a `room` = id du
bloc et `id` = `<date>-bloc-<id du bloc>` (les anciens créneaux jeux vidéo gardent
leur id `…-jv`). À l'ouverture d'une semaine **en cours, à venir ou jamais
enregistrée**, les créneaux sont alignés sur les modèles (`fusionnerBlocs`) :
ajout de ceux qui manquent, horaires recalés sauf s'ils ont été retouchés à la
main (`horsModele`), retrait de ceux qui n'ont plus lieu d'être s'ils sont
vides. Un créneau rempli n'est jamais supprimé, et les semaines passées ne
bougent pas. Retirer un bloc d'une semaine le masque (`masque`) au lieu de le
supprimer, sinon le modèle le recréerait. Chaque créneau garde un instantané
du bloc (`bloc` : nom, icône, couleur, effectif) pour rester lisible si le
modèle change ou disparaît.

**Sous-effectif** : un créneau de la salle principale avec une seule personne en
heures pleines (avant 12 h ou après 15 h, `HEURES_PLEINES`), ou un bloc avec
moins que son effectif, est surligné en orange ; l'en-tête du planning compte
ces créneaux. Le PDF a une colonne par bloc, seulement les semaines où ce bloc
a quelqu'un.

## Les paniers communs : votes et vérification

**Les votes sont nominatifs.** Une voix appartient à un compte
(`paniers_communs_votes`, une ligne par couple ligne/utilisateur, `valeur` à
+1 ou -1) : voter demande donc d'être connecté. Revoter la même valeur retire sa
voix — le bouton est une bascule à trois états (pour / rien / contre).

`paniers_communs_lignes.votes` reste, mais n'est plus qu'un **cache de la
somme**, réécrit depuis le total réel à chaque vote plutôt qu'incrémenté, pour
qu'il ne puisse pas dériver. Il sert au tri et à `/api/store/summary`. La mise à
jour générique d'une ligne (`PUT /api/paniers-communs-lignes/[id]`) refuse
d'écrire cette colonne : sans ça, on pourrait se fabriquer un score sans voter.

Renvoyer depuis un panier personnel un jeu déjà présent dans le commun ne crée
pas de doublon : ça vaut un vote « pour » de l'expéditeur, silencieusement ignoré
s'il n'est pas connecté.

Les **commentaires** (`paniers_communs_commentaires`) suivent la même règle :
lecture ouverte à tous, écriture réservée aux comptes, et chacun ne peut effacer
que les siens.

### Le mode vérification

Bascule la liste en cases à cocher pour retirer les jeux réceptionnés. Il
**recoupe avec les réceptions déjà saisies dans l'atelier** (table `commandes`,
statut `Reçu`) via `GET /api/paniers-communs-lignes/verification`, avec trois
niveaux de certitude :

| Niveau | Règle | Coché d'office |
| --- | --- | --- |
| `ean` | Même code-barres (l'ancien `Manuel` exclu : ce n'est pas un identifiant) | oui |
| `nom` | Noms identiques une fois normalisés (casse, accents, ponctuation) | oui |
| `proche` | Un nom contient l'autre, au-delà de 5 caractères | non, seulement signalé |

`proche` n'est jamais coché automatiquement : « Dixit » et « Dixit Odyssey » se
ressemblent, mais ce sont deux boîtes différentes.

**Le recoupement est en lecture seule.** Valider retire les lignes cochées du
panier commun et ne touche pas à l'atelier, qui reste la seule porte d'entrée des
réceptions. Si l'inverse devient souhaitable un jour, c'est un vrai choix à
faire, pas un détail d'implémentation : deux endroits qui créent des réceptions,
ce sont deux endroits à garder cohérents.

---

## Sources externes

Aucune de ces sources n'est un partenariat : ce sont des sites publics
interrogés à faible volume, une requête par recherche d'utilisateur. Toutes les
intégrations échouent en silence (`catch` → liste vide) plutôt que de casser la
page, et il faut garder ce comportement : **ces sites peuvent changer de format
ou bloquer l'accès du jour au lendemain**.

| Source | Utilisée pour | Route |
| --- | --- | --- |
| BoardGameGeek / geekdo | Fiches de jeux de société (pas de prix) | `/api/store/recherche` |
| Philibert (via Doofinder) | Résolution d'un EAN scanné en nom de jeu | `/api/recherche` |
| Esprit Jeu | Enrichissement des fiches (contenu, mécaniques) | `/api/enrichir`, `/api/espritjeu` |
| Ludifolie | Recherche de jeux de société pour les paniers, **avec prix et stock** | `/api/store/recherche?type=JdS` |
| Trader Games | Recherche de jeux vidéo pour les paniers, avec prix | `/api/store/recherche?type=JV` |
| Trader Games (EAN) + jeuxvideo.com | Ajout d'un jeu vidéo : EAN → titre, puis fiche FR (synopsis, genres, éditeur, sortie, PEGI) | `/api/jv/barcode`, `/api/jv/sources` |
| IGDB (via Twitch) | Fiches de jeux vidéo | `/api/jv/igdb` |
| PlayStation Store, Nintendo, Steam | Recherche de jeux par console | `/api/jv/search` |
| UPCitemdb, OpenLibrary | Résolution de codes-barres | `/api/jv/barcode` |
| Philibert | PDF des règles de jeux (fichiers joints des fiches produit, retrouvées par EAN) | `/api/regles/philibert` |

### Les PDF de règles

Dans la fiche jeu (`/inventaire`), le bouton « Règles (PDF) » ouvre le PDF ; en
mode édition il permet d'envoyer un fichier, ou de le **chercher chez Philibert** :
la fiche produit est retrouvée par EAN (correspondance exacte, aucun rapprochement
par nom) et son fichier joint libellé « règles », de préférence en français, est
copié dans R2. La copie est volontaire : les liens des boutiques cassent.

Pour remplir le catalogue en lot (environ un jeu sur trois a sa règle chez eux) :

```bash
node scripts/importer_regles_philibert.mjs            # ~1 s par jeu, relançable
```

### La recherche du store

Le type de panier détermine la source, via un seul endpoint
`/api/store/recherche?nom=…&type=JdS|JV|jouet` :

- **JV → Trader Games.** Passe par l'endpoint d'autocomplétion du module
  PrestaShop *Leo Product Search*, qui renvoie en une requête le nom complet, le
  prix, l'image et le lien produit — la page de résultats HTML, elle, tronque les
  titres à l'affichage. Le token de la boutique est lu sur la page d'accueil,
  gardé 30 min en mémoire et rechargé seulement s'il est refusé (un token
  invalide renvoie `products: []` *sans* `total_items`, ce qui le distingue d'une
  recherche réellement vide). Les titres encodent plateforme, état et zone : ils
  sont analysés pour afficher des pastilles et pour remonter les vrais jeux avant
  les peluches et figurines.
- **JdS et jouets → Ludifolie**, le fournisseur actuel. Son contrôleur de
  recherche PrestaShop accepte `ajax=1` et renvoie un tableau de produits déjà
  structuré (nom français, éditeur, prix TTC, jaquette). Le stock n'est pas dans
  ce JSON mais dans le HTML joint à la réponse, d'où l'extraction des identifiants
  en rupture. **BoardGameGeek reste en filet** quand un jeu n'est pas référencé
  chez le fournisseur : on retrouve la fiche, mais le prix est à saisir à la main.

> ⚠️ **Trader Games est protégé par un challenge Cloudflare** qui refuse les
> clients non-navigateurs. Le Worker déployé passait le 08/09/2026, mais **depuis
> au moins le 16/10/2026 il est refusé lui aussi** : le jeton de la boutique est
> introuvable (`/api/store/recherche?type=JV&debug=true` →
> `"tradergames:token": "introuvable"`) et la recherche JV renvoie
> `bloque: true`, en production comme en local.
>
> Quand la boutique refuse, la recherche retombe automatiquement sur le catalogue
> jeux vidéo interne (titres et jaquettes, sans prix) et propose un lien vers la
> recherche sur leur site. Le code reste en place au cas où l'accès se rouvre,
> mais la solution durable est de leur demander un accès catalogue (flux
> CSV/XML), comme le proposent beaucoup de boutiques pro. Leur `robots.txt`
> décourage par ailleurs l'exploration des pages de recherche.

### L'ajout d'un jeu vidéo

La fenêtre d'ajout de `/jv` accepte un **EAN** (douchette, saisie + Entrée ou
caméra) ou un titre :

- **EAN** (`/api/jv/barcode`) : d'abord un exemplaire déjà catalogué
  (`jv_jeux.ean`), puis Trader Games (recherche de la boutique par l'EAN, retenue
  seulement si la référence correspond ou s'il n'y a qu'un jeu), à défaut la
  console devinée par le préfixe. Le titre trouvé lance la recherche.
- **Titre** (`/api/jv/sources?q=`) : jeuxvideo.com, Trader Games (nos consoles
  seulement) et IGDB en parallèle.
- **Fiche** (`/api/jv/fiche`, `lib/ficheJv.ts`) : quel que soit le résultat
  choisi (ou l'EAN reconnu, qui y mène directement), la fiche est assemblée
  depuis toutes les sources, champ par champ :

  | Champ | Priorité |
  | --- | --- |
  | Titre, éditeur, année, joueurs, jaquette | IGDB → jeuxvideo.com → (titre Trader Games remis en casse) |
  | Console | boîte scannée / article Trader Games / filtre choisi → jeuxvideo.com → IGDB |
  | Description | jeuxvideo.com → boutique de la console (PS Store, eShop, Steam) → IGDB (anglais) |
  | Genre | jeuxvideo.com → IGDB traduit en français |
  | PEGI | boutique de la console → jeuxvideo.com → IGDB |

  Le jeu IGDB retenu est le plus proche du titre (les « Bundle », DLC et
  éditions sont pénalisés). La fiche affiche la source de chaque champ ;
  « ↻ Compléter les champs vides » relance l'assemblage sans rien écraser.

jeuxvideo.com masque ses liens internes (« JvCare » : URL en hexadécimal sur
l'alphabet `0A12B34C56D78E9F`) et, comme Trader Games, refuse les clients
non-navigateurs : **en local comme en production (constaté le 16/10/2026), ces
deux sources répondent `bloque: true`** et seuls les résultats IGDB s'affichent,
avec un message signalant le refus. Le code est gardé au cas où l'accès se
rouvre ; la description française vient alors, comme avant, des boutiques
plateformes (PlayStation Store, Nintendo eShop, Steam) via `/api/jv/search`.

### Les jeux PC et la wishlist Steam

Les jeux PC ne se commandent pas, ils s'achètent sur Steam. Dans le panier
commun JV, **toute ligne dont la console vaut `PC` sort du tableau à commander**
et bascule dans la wishlist (bouton dans l'en-tête du panier). C'est un
aiguillage à l'affichage : rien n'est déplacé en base, repasser la console sur
Switch ou PS5 ramène la ligne dans le panier. Ces lignes sont exclues partout où
l'on compte ce qu'il y a à commander : total, filtres, PDF, tableau de bord.

Un contrôle quotidien (`.github/workflows/promos-steam.yml`, 10h à Paris)
appelle `/api/store/steam/promos`, qui compare ces jeux aux prix Steam du jour
et **ouvre une alerte par promo qui démarre** — donc visible dans le compteur de
la barre de navigation et sur le tableau de bord. Les alertes dont la promo est
terminée, ou dont le jeu a quitté la wishlist, sont closes automatiquement.
L'appel est rejouable sans risque et le bouton « Signaler les promos » de la
wishlist le déclenche à la main.

Ces alertes n'ont pas de table dédiée : ce sont des lignes de `alertes`
reconnaissables à la mention `· promo Steam ·` dans leur description. C'est ce
marqueur qui permet de les retrouver pour les mettre à jour — le changer casse
le suivi des promos en cours.

### Détection des doublons

`/api/store/doublons?type=JdS|JV&noms=a|b|c` dit, pour chaque nom, si la
ludothèque possède déjà le jeu — `jv_jeux` pour les jeux vidéo, `jeux` pour le
reste, en ignorant les exemplaires retirés. La comparaison se fait en mémoire
côté serveur avec la même normalisation que les pages (casse, accents et
ponctuation ignorés) : un `LIKE` SQL raterait les variantes très fréquentes
entre le catalogue et les fiches boutique.

Les deux usages diffèrent volontairement :

- **Jeux vidéo** : on ne rachète pas un jeu qu'on a déjà. L'ajout d'un jeu connu
  demande confirmation, et les lignes concernées portent une pastille rouge.
- **Jeux de société** : le doublon est souvent voulu. Rien ne bloque, la ligne
  reçoit automatiquement le tag `double` à l'ajout et une pastille jaune
  indiquant le nombre d'exemplaires déjà en rayon.

---

## Déploiement

Tout push sur `main` déclenche `.github/workflows/deploy.yml` → `npm run deploy`
(build OpenNext + `wrangler deploy`), avec les identifiants Cloudflare portés par
l'environnement GitHub `cloudflare`.

Production : <https://ludotool.t-coumond.workers.dev>

Déploiement manuel :

```bash
npm run deploy
```

Configuration dans `wrangler.jsonc` : nom du Worker `ludotool`, binding D1 `DB`, bucket R2 `REGLES`,
binding images, et auto-référence `WORKER_SELF_REFERENCE` requise par OpenNext
pour le cache.

---

## Conventions de code

- **Français** pour les noms de domaine (`jeux`, `paniers`, `chercherLudifolie`),
  les commentaires et l'interface.
- Les commentaires expliquent **pourquoi**, pas quoi : les contraintes externes
  (limite D1, token de boutique, absence d'historique) méritent une ligne, la
  paraphrase du code non.
- Les appels réseau externes ont un timeout et un `catch` qui renvoie une valeur
  vide exploitable.
- Pas de dépendance ajoutée sans raison : la page la plus lourde (`/jv`) tient en
  React et CSS inline, et c'est volontaire.
