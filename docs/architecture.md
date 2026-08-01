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

`/api/search` porte quatre modes :

- `from` (défaut) — où puis-je aller depuis cette gare ce jour-là ?
- `to` — recherche inverse : d'où peut-on rejoindre cette gare ?
- `roundtrip` — quelles destinations ont l'aller **et** le retour réservables ?
- `range` — sur une plage de dates, quelles destinations et combien de jours chacune.

Le mode `roundtrip` mérite un mot, parce qu'il paraît coûteux et ne l'est pas. L'aller donne
les trains hub → X. Pour le retour, on réutilise `fetchInbound` **sur le hub** : ces
enregistrements arrivent au hub, donc leur champ `origine` désigne justement la destination
candidate. Il ne reste qu'à intersecter les deux ensembles. Deux appels amont, comme une
recherche simple.

## La grammaire de recherche

Les cinq modes ne sont pas cinq choix offerts à l'utilisateur : ce sont **trois champs** dont
le mode découle. Une gare de départ, une gare d'arrivée (vide = n'importe où), et une façon
d'interpréter les dates.

| Depuis | Vers | Dates | `mode` |
|---|---|---|---|
| Paris | *vide* | une date | `from` |
| *vide* | Biarritz | une date | `to` |
| Paris | *vide* | aller + retour | `roundtrip` |
| Paris | *vide* | plage | `range` |
| Nantes | Grenoble | une date | `route` |

Cinq onglets présentaient comme des pairs des choses qui n'en sont pas : `from`/`to` est un
sens, `roundtrip`/`range` une façon de choisir les dates, et `route` une autre application
(deux gares en entrée, des correspondances en sortie, un panneau distinct). Les aplatir sur
une ligne obligeait à traduire une intention en vocabulaire d'application.

Deux conséquences dans le code (`app/components/SearchBar.vue`) :

- Le mode est **calculé**, jamais saisi. Une combinaison impossible ne peut donc pas être
  exprimée : le choix aller-retour/plage se désactive dès qu'une gare d'arrivée est saisie.
- L'URL, elle, porte toujours `mode` — elle reste la source de vérité et les liens partagés
  ne changent pas. À l'ouverture, `SearchBar` rétablit l'état de champs qui *produit* ce mode.
  Un formulaire vide ne pouvant pas exprimer « je cherche à l'envers », l'intention reçue de
  l'URL (`/app?mode=to`) survit jusqu'à la première saisie.

Le mode n'étant plus nommé nulle part, une ligne sous le formulaire dit ce que la recherche
va faire. C'était le reproche fait aux onglets : ils nommaient un mode sans l'expliquer.

## Liste et carte : une seule réponse

Le rail de résultats porte des filtres (durée du trajet le plus court, période de départ,
nombre de jours joignables). Ils ne peuvent pas ne s'appliquer qu'à la liste : « 20 affichées »
au-dessus de 74 points sur la carte, ce sont deux réponses différentes à la même question.
`ResultsRail` émet donc les libellés retenus, `MapView` s'y restreint et recadre dessus —
filtrer sur « ≤ 2h » dessine littéralement le cercle des deux heures autour de la gare.

La fiche de résultat ne sert qu'à **choisir** : nom, notoriété, durée du plus court trajet,
amplitude des départs. Tout le détail (horaires, réservation, dates de retour) vit dans la
fiche ancrée sur la carte, ouverte au clic. Une recherche à quatre semaines renvoie couramment
70 destinations et une exploration sur une semaine 130 : tout déplier faisait plusieurs mètres
de défilement, dont deux liens de réservation par ligne.

## Pages d'entrée par gare

`/depuis/[slug]` est une page statique par gare de départ, pré-rendue au build (304 pages).
Elles ne contiennent **aucune donnée temps réel** : uniquement du contenu, du maillage interne
et des liens vers l'application. C'est délibéré — pré-rendre 304 pages qui interrogeraient
l'open data SNCF reviendrait à marteler leur API à chaque build.

Les slugs viennent de `shared/booking.json`, la même table que les liens de réservation.

## Fond de carte

[OpenFreeMap](https://openfreemap.org) sert les tuiles vectorielles : libre, sans clé d'API ni
quota, et auto-hébergeable — cohérent avec un projet qui refuse toute dépendance à clé. Données
OpenStreetMap, schéma OpenMapTiles.

Deux retouches sont appliquées au style une fois chargé (`styleBaseMap`) :

- **Libellés en français.** Le style amont affiche `name:latin`, ce qui donnait « Brittany »,
  « Upper France » et « New Aquitania » sur une carte française. On substitue
  `coalesce(name:fr, name:latin, name)` — mais uniquement sur les couches dont le libellé
  contient un nom : les écussons de route utilisent `ref` et seraient vidés.
- **Teinte de la charte** : fond crème, eau bleu-vert désaturée. Le fond doit rester en retrait
  pour que les tracés teal et les marqueurs corail se détachent.

L'attribution provient du TileJSON de la source et s'affiche seule : la déclarer via
`customAttribution` la ferait apparaître en double.

## Liens de réservation

Ni SNCF Connect ni Trainline n'exposent de lien profond vers une recherche pré-remplie : leurs
formulaires sont pilotés en JavaScript sans `action`, et les boutons « Réserver » de leurs pages
horaires n'ont pas de `href`. Leur seule surface publique adressable est la page horaires d'une
paire de villes — sans la date.

Ces URL exigent un **nom de ville**, pas un libellé de gare : `marseille-st-charles` renvoie 404,
`marseille` fonctionne. D'où `scripts/build-booking.py`, qui construit la table libellé → slug en
vérifiant chaque candidat contre Trainline (dont le `robots.txt` autorise ces pages et qui renvoie
des statuts fiables). SNCF Connect protège son site par un défi anti-bot et ne peut pas être
vérifié automatiquement ; on réutilise le slug validé, les deux sites employant les mêmes noms de
ville. 307 des 341 gares sont couvertes, les autres n'affichent simplement pas de lien.

## La fenêtre de 30 jours

Les places à 0 € n'ouvrent que 30 jours avant le départ. Ce n'est pas une limite qu'on
s'impose : le dataset s'appelle « Disponibilité **à 30 jours** de places MAX JEUNE et MAX
SENIOR ouvertes à la réservation » et ne contient rien au-delà — un `order_by=date desc`
le confirme, sa date maximale est toujours J+30.

Une date hors fenêtre renvoyait donc zéro résultat, ce qui se lit comme une panne plutôt
que comme une règle du produit. `shared/window.ts` porte la borne, utilisée des deux côtés :

- le sélecteur de date la pose en `max`, et une note explique la règle sous le formulaire ;
- `/api/search` et `/api/route` refusent au-delà (400), et une plage débordante est **bornée**
  plutôt que refusée — sans quoi `mode=range` déclencherait un appel amont par jour dans le
  vide, jusqu'à une centaine de requêtes inutiles sur l'API publique.

`todayISO()` calcule la date locale et non `toISOString()` : en France l'été, entre minuit
et 2 h du matin, la date UTC désigne encore la veille, et le champ proposerait un jour passé.

## Une ville n'est pas sa propre destination

Le dataset relie une ville à elle-même quand elle a plusieurs gares : Lyon Part-Dieu →
Lyon Perrache portent tous deux le libellé `LYON (intramuros)`. C'est un vrai train, mais
chercher où aller depuis Lyon pour s'entendre répondre « Lyon, 8 min » n'a pas de sens.

`/api/search` écarte donc les destinations dont la clé normalisée égale celle du pivot, dans
les quatre modes. `/api/route` refuse une origine égale à sa destination, sans quoi
l'exploration part chercher des correspondances entre une ville et elle-même. Côté
formulaire, chaque champ gare exclut la valeur de l'autre de ses suggestions.

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
| Fond de carte | OpenFreeMap | Libre, sans clé ni quota, auto-hébergeable — comme le reste du projet |
| Licence | AGPL-3.0 | Une version hébergée modifiée doit republier son code : personne ne peut refermer le projet derrière un paywall |
| Store | `useState` + composables | Pas assez d'état partagé pour justifier Pinia |
| Coordonnées | Référentiel embarqué | Pas d'appel réseau ni de clé pour géocoder ; index construit une fois au démarrage |
| Notoriété | Wikipédia pré-calculé | Gratuit, sans clé, et calculé hors ligne plutôt qu'à chaque requête |

## Ce que le projet n'est pas

Pas d'authentification, pas de comptes, pas de paiement, pas de publicité. Ce n'est pas un
oubli : c'est la raison d'être de cette réécriture. La v1 de l'application avait un paywall qui
limitait le nombre de recherches ; v2 s'en débarrasse et ne le réintroduira pas.

L'instance officielle mesure son audience avec Rybbit — sans cookie, sans identifiant
persistant, sans profil publicitaire, hébergé dans l'UE. `NUXT_PUBLIC_RYBBIT_SITE_ID` est vide
par défaut : le dépôt étant public et l'auto-hébergement une fonctionnalité annoncée, coder
l'identifiant en dur enverrait le trafic d'une instance tierce vers un compte qu'elle n'a pas
choisi. L'instance officielle le fournit au build.

Trainquillou ne réserve pas les billets et n'est pas affilié à la SNCF. Il montre où aller ; la
réservation se fait sur SNCF Connect.

## Tests

```bash
pnpm test
```

La logique pure (normalisation de libellés, matching, groupement) est isolée dans `server/utils/`
et testée sans réseau. Les routes serveur se testent sur fixtures, jamais contre l'API réelle.
