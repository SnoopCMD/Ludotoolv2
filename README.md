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
| `/` | Tableau de bord : présences du jour, événements, nouveautés |
| `/inventaire` | Parc de jeux : recherche, fiches, statuts, doubles |
| `/atelier` | Jeux en préparation et étapes (plastification, contenu, étiquette, équipement, encodage, notice), réceptions de commandes |
| `/agenda` | Planning de l'équipe : horaires, absences, événements, échanges de jours, PDF |
| `/store` | Paniers d'achat (jeux de société, jeux vidéo, jouets), commandes communes, devis PDF |
| `/catalogage` | Attribution des codes Syracuse |
| `/jv` | Jeux vidéo : catalogue, sélections par console, rotations, réservations de postes, stats, notes |
| `/suggestions` | Boîte à idées interne |
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

Base D1 `ludotool-db` (binding `DB`).

| Table | Contenu |
| --- | --- |
| `jeux` | Exemplaires physiques : statut, étapes de préparation, code Syracuse, notes |
| `catalogue` | Fiche par EAN : nom, éditeur, image, couleur de pastille, mécanique, contenu… |
| `editeurs` | Éditeurs |
| `commandes` | Réceptions de commandes |
| `equipe`, `evenements`, `planning_semaine` | Agenda : membres, horaires, absences, planning |
| `paniers`, `panier_lignes` | Paniers d'achat |
| `paniers_communs_lignes` | Lignes des commandes communes, avec votes |
| `jv_jeux`, `jv_selections`, `jv_reservations`, `jv_rotation_config`, `jv_notes` | Section jeux vidéo |
| `pieces_manquantes`, `pieces_trouvees`, `reparations` | Suivi du matériel |
| `alertes`, `suggestions`, `selections` | Alertes, boîte à idées, sélections thématiques |

Les migrations de `migrations/` sont appliquées manuellement :

```bash
npx wrangler d1 execute ludotool-db --remote --file ./migrations/0007_suggestions.sql
```

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
| IGDB (via Twitch) | Fiches de jeux vidéo | `/api/jv/igdb` |
| PlayStation Store, Nintendo, Steam | Recherche de jeux par console | `/api/jv/search` |
| UPCitemdb, OpenLibrary | Résolution de codes-barres | `/api/jv/barcode` |

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
> clients non-navigateurs. Le Worker déployé passe — vérifié en production le
> 08/09/2026 — mais pas un poste de développement : **en local, la recherche JV
> renvoie systématiquement `bloque: true`, ce n'est pas un bug**. Pour la tester,
> viser la production.
>
> Quand la boutique refuse, la recherche retombe automatiquement sur le catalogue
> jeux vidéo interne (titres et jaquettes, sans prix) et propose un lien vers la
> recherche sur leur site. Ça peut cesser de fonctionner à tout moment, sans
> prévenir : la solution durable serait de leur demander un accès catalogue (flux
> CSV/XML), comme le proposent beaucoup de boutiques pro. Leur `robots.txt`
> décourage par ailleurs l'exploration des pages de recherche.

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

Configuration dans `wrangler.jsonc` : nom du Worker `ludotool`, binding D1 `DB`,
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
