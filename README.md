<div align="center">

<img src="public/logo-mark.png" alt="" width="88">

# Trainquillou

**Trouvez toutes les destinations TGVmax réservables depuis votre gare, sur une carte interactive.**

Gratuit, sans publicité, sans compte, sans cookie. Open source sous AGPL-3.0.

[![Licence: AGPL-3.0](https://img.shields.io/badge/licence-AGPL--3.0-14b8b0)](LICENSE)
[![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00DC82?logo=nuxt&logoColor=white)](https://nuxt.com)
[![Données open data SNCF](https://img.shields.io/badge/données-open%20data%20SNCF-0b1f3a)](https://data.sncf.com/explore/dataset/tgvmax/)
[![Tests](https://img.shields.io/badge/tests-78%20passants-14b8b0)](test/)

</div>

---

## Le problème

Vous avez un abonnement **TGVmax** et trois jours de libres. L'application SNCF vous demande où
vous voulez aller — mais la vraie question est l'inverse : **où peut-on aller ?** Trouver la
réponse suppose de tester les destinations une par une.

Trainquillou renverse la question. Vous donnez une gare et une date, il affiche sur une carte
toutes les destinations où il reste des places TGVmax.

## Ce que ça fait

Une gare de départ, une gare d'arrivée (laissez-la vide pour dire *n'importe où*) et une date.
Les cinq façons de chercher découlent de ces trois champs, il n'y a pas de mode à choisir :

| Vous remplissez | Question à laquelle ça répond |
|---|---|
| **Depuis** seul | Où puis-je aller depuis Lyon samedi ? |
| **Vers** seul | D'où peut-on rejoindre Biarritz ce jour-là ? |
| **Depuis** + aller-retour | Je pars vendredi soir et je rentre dimanche : quelles destinations ont les deux trajets réservables ? |
| **Depuis** + plusieurs jours | Sur la semaine du 10, quelles destinations sont joignables, et combien de jours chacune ? |
| **Depuis** + **Vers** | Pas de TGVmax direct Nantes-Grenoble : quelles correspondances le rendent possible ? |

Et aussi :

- **Carte interactive** MapLibre GL : les destinations sont reliées à votre gare, et un clic sur
  une ville ouvre ses horaires, sa durée de trajet et ses liens de réservation.
- **Filtres** par durée de trajet et par période de départ, appliqués à la liste **et** à la carte —
  cocher « ≤ 2h » dessine le cercle des deux heures autour de votre gare.
- **Tri** par durée, par ordre alphabétique ou par notoriété touristique.
- **Dates de retour disponibles** pour chaque destination, en un clic.
- **Liens de réservation** vers SNCF Connect et Trainline.
- **Recherches partageables** : l'URL contient toute la recherche, un lien collé rejoue le même écran.
- **Jours de repli suggérés** quand la date demandée ne donne aucun itinéraire.

## Démarrer

Prérequis : **Node 20+** et **pnpm**.

```bash
git clone https://github.com/csanchez-jetdev/trainquillou.git
cd trainquillou
pnpm install
pnpm dev          # http://localhost:3001
```

Aucune clé d'API, aucun compte, aucun fichier `.env` : l'open data SNCF est ouvert et le
référentiel des gares est embarqué dans le dépôt.

```bash
pnpm test         # 78 tests, sans accès réseau
pnpm build        # build de production
pnpm preview      # prévisualiser le build
```

## S'auto-héberger

Le build produit un serveur Node autonome, sans base de données ni service externe :

```bash
pnpm build
node .output/server/index.mjs     # écoute sur $PORT, 3000 par défaut
```

Placez-le derrière un reverse proxy (Caddy, nginx, Traefik) pour TLS. Le cache est en mémoire :
un redémarrage le vide, sans conséquence. Comptez environ 200 Mo de RAM, l'essentiel étant
l'index des 6 469 gares construit au démarrage.

Deux variables d'environnement, toutes deux facultatives :

| Variable | Effet |
|---|---|
| `NUXT_PUBLIC_SITE_URL` | URL publique, pour les liens canoniques et le sitemap |
| `NUXT_PUBLIC_RYBBIT_SITE_ID` | Active la mesure d'audience [Rybbit](https://rybbit.io) avec **votre** identifiant. Non définie, aucun script tiers n'est chargé |

La licence AGPL-3.0 vous autorise à héberger votre propre instance, y compris modifiée, à
condition de publier vos modifications.

## Questions fréquentes

### Qu'est-ce que TGVmax ?

Un abonnement SNCF pour les 16-27 ans qui donne accès à un nombre illimité de trajets sur les
trains éligibles, dans la limite des places réservées à l'abonnement. Ces places sont
contingentées : un train peut circuler sans être ouvert à l'abonnement. C'est ce contingent que
Trainquillou rend visible.

La SNCF a renommé l'offre **MAX JEUNE** en 2023. « TGVmax » reste le nom sous lequel la plupart
des abonnés la connaissent, et celui du dataset open data : les deux termes cohabitent donc dans
l'interface et dans les métadonnées, sans en privilégier un.

### Trainquillou réserve-t-il mes billets ?

Non. Il montre où il reste des places et renvoie vers SNCF Connect ou Trainline pour la
réservation. Il n'est pas affilié à la SNCF.

### Pourquoi ne puis-je pas chercher au-delà d'un mois ?

Parce que les places à 0 € n'ouvrent que **30 jours avant le départ**. Ce n'est pas une
limite de Trainquillou : le jeu de données SNCF s'appelle littéralement « Disponibilité à
30 jours de places MAX JEUNE et MAX SENIOR ouvertes à la réservation » et ne contient rien
au-delà. Le sélecteur de date s'arrête donc à cette échéance plutôt que de renvoyer une
page vide qui ressemblerait à une panne.

### Les disponibilités sont-elles en temps réel ?

Elles viennent du dataset open data SNCF `tgvmax`, mis à jour par la SNCF, et sont mises en cache
10 minutes par recherche. Une place peut donc partir entre l'affichage et votre réservation.

### Faut-il créer un compte ?

Non, et ce n'est pas prévu. Il n'y a ni compte, ni paywall, ni publicité. Trainquillou est un
service gratuit, sans but lucratif.

### Mes visites sont-elles suivies ?

L'instance officielle mesure son audience avec [Rybbit](https://rybbit.com) : sans cookie, sans
identifiant persistant, sans profil publicitaire, et sans stockage des adresses IP,
[politique de confidentialité](https://rybbit.com/privacy).

Au-delà des pages vues, trois événements anonymes sont envoyés : `search` (mode, gare, nombre de
résultats), `booking_click` (revendeur, ville, mode) et `returns_lookup` (ville). Ils indiquent
quelles fonctionnalités servent — pas qui les utilise.

Le site lui-même tourne sur un VPS OVH à Gravelines (Nord, France), sans CDN intermédiaire.

Rien de tout cela n'est actif dans le code que vous clonez : la mesure ne s'active que si vous
fournissez votre propre identifiant au build (voir ci-dessous). Une instance auto-hébergée
n'envoie donc rien, ni à nous ni à personne.

### Combien de gares sont couvertes ?

Les 341 gares présentes dans le dataset TGVmax, dont les destinations à l'étranger : Bruxelles,
Genève, Luxembourg, Barcelone, Milan, Berlin, Munich, Francfort.

### Comment sont trouvées les coordonnées des gares ?

Depuis le référentiel SNCF « liste des gares », embarqué dans le dépôt. Les libellés des deux
jeux de données ne correspondent presque jamais à l'identique, donc la résolution passe par une
normalisation puis deux tables explicites — voir [docs/architecture.md](docs/architecture.md).
Une gare dont les coordonnées restent introuvables est listée sans marqueur, jamais placée au
hasard.

### Puis-je réutiliser le code pour mon projet ?

Oui, sous AGPL-3.0 : vous pouvez l'utiliser, le modifier et l'héberger, à condition de publier
le code source de votre version, y compris si vous ne la distribuez que comme service en ligne.

## API

Le client ne parle qu'à ces routes, jamais directement à la SNCF — pour le CORS, le cache et un
format stable. Elles sont utilisables telles quelles si vous auto-hébergez.

| Route | Description |
|---|---|
| `GET /api/stations` | Libellés des gares, pour l'autocomplétion |
| `GET /api/search?origin=&date=&mode=&dateTo=` | Destinations réservables, enrichies des coordonnées |
| `GET /api/returns?origin=&dest=&from=` | Dates de retour disponibles pour un trajet |
| `GET /api/route?from=&to=&date=&stops=` | Itinéraires avec correspondances |

`mode` vaut `from` (défaut), `to`, `roundtrip` ou `range`. Les modes `roundtrip` et `range`
exigent `dateTo`.

```bash
curl 'http://localhost:3001/api/search?origin=LYON%20(intramuros)&date=2026-08-14'
```

## Architecture

**Nuxt 4** · **Vue 3** · **TypeScript strict** · **Tailwind v4** · **MapLibre GL** · **Nitro** · **pnpm**

Le détail des choix et de leurs raisons est dans [docs/architecture.md](docs/architecture.md).

Si vous attaquez le dataset TGVmax pour votre propre projet,
[docs/sncf-api.md](docs/sncf-api.md) documente ses comportements non documentés — dont un
endpoint qui tronque silencieusement la liste des gares aux deux tiers.

## Scripts de données

Deux tables sont pré-calculées hors ligne et commitées, pour que l'application n'ait aucune
dépendance réseau à l'exécution. À relancer ponctuellement, ces données évoluent lentement.

```bash
uv run scripts/build-popularity.py   # score de notoriété touristique par gare
uv run scripts/build-booking.py      # slugs de ville pour les liens de réservation
```

Ils nécessitent [uv](https://docs.astral.sh/uv/) ; les dépendances sont déclarées dans l'en-tête
de chaque script.

### Images du hero

L'image d'accueil est l'élément LCP de la page : ses variantes sont générées à la main et
commitées, plutôt que produites par un module Nuxt. L'image ne change jamais, et `.output/`
doit rester sans binaire natif pour qu'un build lancé depuis un Mac arm64 tourne dans le
conteneur amd64 (voir `infra/deploy.sh`). Deux variantes AVIF (69 % de moins que le JPEG à
qualité indiscernable), `hero.jpg` en repli pour les navigateurs sans AVIF.

Pour les régénérer, avec [vips](https://www.libvips.org/) (`brew install vips`) :

```bash
vips thumbnail public/hero.jpg 'public/hero-800.avif[Q=58]' 800
vips thumbnail public/hero.jpg 'public/hero-1672.avif[Q=58]' 1672
vips thumbnail public/hero.jpg public/hero-800.jpg 800
vips thumbnail public/hero.jpg public/hero-1200.jpg 1200
```

**Ne pas utiliser `sips` pour l'AVIF** : il produit un fichier dont Chromium lit les dimensions
mais pas les pixels, et le hero s'affiche vide.

## Contribuer

Les contributions sont bienvenues. Quelques conventions :

- **Commits conventionnels** (`feat:`, `fix:`, `docs:`, `chore:`).
- TypeScript strict, pas de `any` silencieux.
- La logique pure va dans `server/utils/` et se teste sans réseau. Les tests ne doivent jamais
  appeler l'API SNCF : utilisez les fixtures de `test/fixtures/`.
- Pas de paywall, pas d'authentification, pas de publicité, pas de profilage publicitaire.
  Ce n'est pas négociable, c'est la raison d'être du projet. La mesure d'audience de l'instance
  officielle est sans cookie et désactivée par défaut dans le code.

Avant d'ouvrir une PR : `pnpm test && pnpm build`.

## Données et attributions

- Disponibilités TGVmax : [open data SNCF, dataset `tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/).
- Coordonnées des gares : référentiel SNCF « liste des gares ».
- Coordonnées d'appoint (gares étrangères, arrêts hors référentiel) :
  [OpenStreetMap](https://www.openstreetmap.org/copyright) via Nominatim.
- Score de notoriété : nombre d'éditions linguistiques Wikipédia de la commune.
- Fond de carte : OpenStreetMap, rendu MapLibre GL.

Les jeux de données SNCF sont diffusés sous **ODbL** : attribution obligatoire et partage à
l'identique des bases dérivées. Les fichiers de `server/assets/` qui en dérivent restent sous
ODbL, indépendamment de la licence du code.

## Licence

[AGPL-3.0](LICENSE). Vous pouvez héberger, modifier et redistribuer ce projet ; toute version
hébergée modifiée doit republier son code source. Autrement dit : personne ne peut refermer
Trainquillou derrière un paywall.

---

<div align="center">
<sub>Non affilié à la SNCF. La réservation des places TGVmax se fait sur SNCF Connect.</sub>
</div>
