# Architecture

Comment Trainquillou est construit, et pourquoi.

## Principe directeur

**Le client ne parle jamais directement à l'open data SNCF.** Toutes les requêtes passent par
des routes serveur Nitro (`/api/*`) qui proxifient, mettent en cache et normalisent les données.

Trois raisons :

1. **CORS** — l'API SNCF n'est pas conçue pour être appelée depuis un navigateur tiers.
2. **Cache** — une même recherche est servie depuis la mémoire au lieu de retaper l'amont.
3. **Format stable** — si l'API SNCF change de version ou de schéma, un seul fichier bouge
   (`server/utils/sncf.ts`) et le front n'est pas touché.

## Vue d'ensemble

```
Navigateur (Nuxt 4 / Vue 3)
  SearchBar ── ResultsRail ── MapView (MapLibre GL)  ── RoutePanel
        │
        │  useSearch / useStations / useReturns / useItinerary
        │  (l'URL est la source de vérité : ?origin=&date=&mode=)
        ▼
Serveur Nitro — routes /api/*
        │  defineCachedEventHandler (TTL 10 min ; 6 h pour les gares)
        ▼
  server/utils/sncf.ts ─────────────► API Explore SNCF v2.1 (dataset tgvmax)
  server/utils/coords.ts ───────────► gares.json (référentiel SNCF, embarqué)
  server/utils/popularity.ts ──────► popularity.json (scores pré-calculés)
  server/utils/routing.ts ─────────► recherche d'itinéraires avec correspondances
```

## Routes serveur

| Route | Rôle | TTL cache |
|---|---|---|
| `GET /api/stations` | Libellés de gares pour l'autocomplétion | 6 h |
| `GET /api/search?origin=&date=&mode=&dateTo=` | Destinations réservables, enrichies des coordonnées | 10 min |
| `GET /api/returns?origin=&dest=&from=` | Dates de retour disponibles pour un trajet | 10 min |
| `GET /api/route?from=&to=&date=&stops=` | Itinéraires A → B avec correspondances | 10 min |

`/api/search` porte trois modes :

- `from` (défaut) — où puis-je aller depuis cette gare ce jour-là ?
- `to` — recherche inverse : d'où peut-on rejoindre cette gare ?
- `range` — sur une plage de dates, quelles destinations et combien de jours chacune.

## Le filtre métier essentiel

Le dataset `tgvmax` liste **tous** les trains, pas seulement ceux ouverts à la réservation
TGVmax. Un seul champ compte :

```ts
if (record.od_happy_card !== 'OUI') continue  // pas de place TGVmax sur ce train
```

Oublier ce filtre fait afficher des trains que l'abonnement ne couvre pas. Il est appliqué à la
fois côté requête (`refine=od_happy_card:OUI`) et côté groupement, par sécurité.

## Coordonnées des gares

Les libellés du dataset `tgvmax` (`"PARIS (intramuros)"`) et ceux du référentiel des gares
(`"Paris-Gare-de-Lyon"`) ne correspondent presque jamais à l'identique. La résolution se fait en
quatre temps (`server/utils/stations.ts`), du plus sûr au moins sûr :

1. **Normalisation** en une clé commune aux deux référentiels : sans accent, sans casse, sans
   ponctuation, `Saint` ramené sur l'abréviation `St`, et le marqueur `(intramuros)` retiré.
2. **`EXTRA_STATIONS`** — coordonnées explicites pour les gares absentes de `gares.json` :
   les gares étrangères, et Marne-la-Vallée-Chessy.
3. **`LABEL_ALIASES`** — aiguillage explicite des libellés TGVmax qui ne correspondent à aucune
   clé du référentiel (`LORRAINE TGV` → `Lorraine-Louvigny-TGV`).
4. **Repli heuristique** — pour un libellé que SNCF viendrait d'ajouter. Volontairement
   conservateur : le candidat retenu doit être entièrement contenu dans le libellé cherché, et
   la comparaison est mot à mot, jamais en sous-chaîne.

Ce dernier point est ce qui coûte le plus cher à se tromper. Une comparaison par sous-chaîne
plaçait Frankfurt dans la commune d'Ur (« ur » est une syllabe de « frankf**ur**t »), Lorraine TGV
dans la commune de Rai (« lor**rai**ne ») et Roissy CDG à Issy (« ro**issy** »). D'où deux règles :
aucun mot de moins de trois lettres ne peut servir de point d'accroche, et **en cas de doute on ne
renvoie rien**.

Ne rien renvoyer est un choix assumé : une gare sans coordonnées est **quand même listée** dans
les résultats, simplement sans marqueur sur la carte. Un point manquant se remarque à peine ; un
point à 600 km décrédibilise toute la carte.

Les 103 libellés du dataset se résolvent aujourd'hui sans passer par le repli, et un test le
vérifie. Si SNCF ajoute un libellé, ce test échoue — le signal qu'il faut lui ajouter un alias
plutôt que laisser l'heuristique deviner.

## Recherche d'itinéraires (`server/utils/routing.ts`)

Quand il n'existe aucun TGVmax direct entre A et B, on compose un trajet avec jusqu'à 3 gares
intermédiaires. L'algorithme est un parcours en largeur *time-dependent* :

- on part de `outbound(A)`, et le **dernier saut** vers B est résolu via l'index `inbound(B)` —
  d'où le coût de seulement 2 appels amont pour 0 ou 1 correspondance ;
- une correspondance n'est valable que si le départ suit l'arrivée d'au moins `MIN_TRANSFER`
  (10 min), les réservations TGVmax étant indépendantes les unes des autres ;
- l'expansion est bornée par un budget d'appels (`FETCH_BUDGET`) et élaguée par dominance
  (on ne garde que la meilleure arrivée par gare, puis les `FRONTIER_CAP` meilleures) ;
- un itinéraire est renvoyé par « forme de trajet » (jeu de gares intermédiaires), le plus rapide
  pour cette forme.

Quand la date demandée ne donne rien, `feasibleNextDays` sonde les 3 jours suivants en 2 appels
par jour pour suggérer des dates qui marchent.

## Score de notoriété

`server/assets/popularity.json` associe à chaque gare un score dérivé du nombre d'éditions
linguistiques de la page Wikipédia de sa commune — un proxy gratuit et sans clé de l'intérêt
touristique. Il alimente le tri « par notoriété » du rail de résultats.

Régénération : `uv run scripts/build-popularity.py` (ponctuel, ces données bougent lentement).

## État côté client

**L'URL est la source de vérité** (`/app?origin=PARIS&date=2026-08-14&mode=from`). Conséquences
voulues : les recherches sont partageables, le bouton retour du navigateur fonctionne, et un
rechargement redonne exactement le même écran.

L'état vit dans des composables (`useSearch`, `useStations`, `useReturns`, `useItinerary`) appuyés
sur `useState`. **Pas de Pinia** : le besoin ne le justifie pas.

## Choix techniques et arbitrages

| Sujet | Choix | Pourquoi |
|---|---|---|
| Carte | MapLibre GL | Rendu vectoriel, pas de clé API, fork libre de Mapbox GL |
| Licence | AGPL-3.0 | Une version hébergée modifiée doit republier son code : personne ne peut refermer le projet derrière un paywall |
| Store | `useState` + composables | Pas assez d'état partagé pour justifier Pinia |
| Coordonnées | Référentiel embarqué | Pas d'appel réseau ni de clé pour géocoder ; index construit une fois au démarrage |
| Notoriété | Wikipédia pré-calculé | Gratuit, sans clé, et calculé hors ligne plutôt qu'à chaque requête |

## Ce que le projet n'est pas

Pas d'authentification, pas de comptes, pas de paiement, pas de tracking analytics. Ce n'est pas
un oubli : c'est la raison d'être de cette réécriture. La v1 de l'application avait un paywall
qui limitait le nombre de recherches ; v2 s'en débarrasse et ne le réintroduira pas.

Trainquillou ne réserve pas les billets et n'est pas affilié à la SNCF. Il montre où aller ; la
réservation se fait sur SNCF Connect.

## Tests

```bash
pnpm test
```

La logique pure (normalisation de libellés, matching, groupement) est isolée dans `server/utils/`
et testée sans réseau. Les routes serveur se testent sur fixtures, jamais contre l'API réelle.
