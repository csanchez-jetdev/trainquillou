# Architecture

Comment Trainquillou est construit, et pourquoi.

## Principe directeur

**Personne n'interroge l'open data SNCF pendant qu'un visiteur attend.** Un export quotidien
alimente une base locale ; les routes `/api/*` ne lisent que cette base.

Trois raisons :

1. **La donnée amont ne change qu'une fois par jour**, vers 04h30 UTC. L'interroger à chaque
   recherche coûtait jusqu'à 56 appels HTTP pour une question d'itinéraire, et ne rendait
   rien de plus récent qu'une copie du matin.
2. **L'historique n'existe que si on l'écrit.** Le jeu de données amont est une fenêtre
   glissante de 30 jours : ce qui n'a pas été enregistré le jour où il était visible a
   disparu. C'est ce qui rend possible les tendances de disponibilité.
3. **Format stable** — si l'API SNCF change de version ou de schéma, un seul fichier bouge
   (`backend/tgvmax/sncf.py`) et ni le front ni les autres routes ne sont touchés.
4. **CORS** — l'API SNCF n'est de toute façon pas appelable depuis le navigateur.

## Vue d'ensemble

```
Navigateur (Nuxt 4 / Vue 3)
  SearchBar ── ResultsRail ── MapView (MapLibre GL) ── RoutePanel ── Planificateur
        │
        │  useSearch / useStations / useReturns / useItinerary / useMultileg
        │  (l'URL est la source de vérité : ?origin=&date=&mode=)
        ▼
Proxy (Caddy) ─── /api/* ──► API Django          reste ──► serveur Nitro (pages)
                               │
                               │  tgvmax/api.py (Django Ninja)
                               ▼
   tgvmax/search.py ─────────► les quatre modes de recherche
   tgvmax/routing.py ────────► itinéraires avec correspondances
   tgvmax/multileg.py ───────► voyages en plusieurs étapes
   tgvmax/stations.py ───────► coordonnées (gares.json, référentiel embarqué)
   tgvmax/lookups.py ───────► notoriété et slugs de réservation (pré-calculés)
                               │
                               ▼
                        SQLite (Offer, AvailabilityChange, Station)
                               ▲
                               │  tgvmax/ingest.py, une fois par jour
                        API Explore SNCF v2.1 (export du dataset tgvmax)
```

## Routes serveur

| Route | Rôle | Cache |
|---|---|---|
| `GET /api/stations` | Libellés de gares pour l'autocomplétion | — |
| `GET /api/search?origin=&date=&mode=&dateTo=` | Destinations réservables, enrichies des coordonnées | — |
| `GET /api/returns?origin=&dest=&from=` | Dates de retour disponibles pour un trajet | — |
| `GET /api/route?from=&to=&date=&stops=` | Itinéraires A → B avec correspondances | — |
| `GET /api/multileg?stops=A\|B\|C&date=&dateTo=&minStay=` | Voyage en plusieurs étapes, boucle, excursion | — |
| `GET /api/stats?origin=` | Agrégats de l'offre réservable, pour la page publique | 10 min |
| `GET /api/updated` | Date du dernier relevé et part éligible, pour l'accueil | 10 min |
| `GET /api/health` | État du service et de sa base | — |

Toutes lisent la base locale et répondent en quelques millisecondes ; seule `/api/stats`, dont
deux agrégats balaient la table entière, justifie un cache.

`/api/search` porte quatre modes :

- `from` (défaut) — où puis-je aller depuis cette gare ce jour-là ?
- `to` — recherche inverse : d'où peut-on rejoindre cette gare ?
- `roundtrip` — quelles destinations ont l'aller **et** le retour réservables ?
- `range` — sur une plage de dates, quelles destinations et combien de jours chacune.

Le mode `roundtrip` paraît coûteux et ne l'est pas. L'aller donne les trains hub → X ; le
retour se lit sur les trajets qui **arrivent** au hub, dont le champ `origine` désigne
justement la destination candidate. Deux requêtes indexées, comme une recherche simple.

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

Le mode n'étant nommé nulle part, une ligne sous le formulaire dit ce que la recherche va
faire.

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

`/depuis/[slug]` est une page statique par gare de départ, pré-rendue au build. Elles ne
contiennent **aucune donnée temps réel** : uniquement du contenu, du maillage interne et des
liens vers l'application. La liste des gares qui en méritent une vient de
`shared/station-pages.json`, calculé par `scripts/build-station-pages.py`.

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

`todayISO()` lit l'heure de **Paris** via `Intl`, et non celle de la machine : la fenêtre est
une règle SNCF en heure française, et le rendu serveur — un conteneur en UTC — doit produire la
même date que le navigateur, où que soit le visiteur. Sans cela, entre minuit et 2 h du matin en
France, le serveur rendait la veille et le navigateur le jour même : le champ affichait deux
dates différentes avant et après hydratation. L'ajout des 30 jours se fait en arithmétique
calendaire et non en millisecondes, qu'un changement d'heure décalerait d'un jour.

Le formulaire propose `J+30` dès minuit à Paris, alors que la base ne contient ce jour qu'après
l'ingestion de 05 h 15 UTC : le dernier jour du sélecteur renvoie un 400 pendant les quelques
heures qui les séparent. La fenêtre faisant autorité est celle des données, pas celle de
l'horloge ; l'exposer dans `/api/updated` reste à faire.

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

```
where=od_happy_card="OUI"
```

Oublier ce filtre fait afficher des trains que l'abonnement ne couvre pas. Il est appliqué à
l'export amont, donc une offre n'entre dans la base que parce qu'elle était réservable : elle
cesse de l'être en disparaissant d'un export suivant, jamais par un drapeau.

## Coordonnées des gares

Les libellés du dataset `tgvmax` (`"PARIS (intramuros)"`) et ceux du référentiel des gares
(`"Paris-Gare-de-Lyon"`) ne correspondent presque jamais à l'identique. La résolution se fait en
quatre temps (`backend/tgvmax/stations.py`), du plus sûr au moins sûr :

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

Les 341 libellés du dataset se résolvent aujourd'hui sans que le repli décide seul, et un test
le vérifie. Si SNCF ajoute un libellé, ce test échoue — le signal qu'il faut lui ajouter un
alias plutôt que laisser l'heuristique deviner.

## Recherche d'itinéraires (`backend/tgvmax/routing.py`)

Quand il n'existe aucun TGVmax direct entre A et B, on compose un trajet avec jusqu'à 3 gares
intermédiaires. L'algorithme est un parcours en largeur *time-dependent* :

- une requête indexée ramène tous les trajets réservables du jour, puis la marche est en
  mémoire : on part des départs de A, et le **dernier saut** vers B est résolu via un index
  des arrivées à B ;
- une correspondance n'est valable que si le départ suit l'arrivée d'au moins `MIN_TRANSFER`
  (10 min), les réservations TGVmax étant indépendantes les unes des autres ;
- une ville que le référentiel nomme d'un seul libellé pour plusieurs gares (`PARIS`, `LYON`
  et `LILLE (intramuros)`) impose sa marge à elle (`CITY_TRANSFER`) : la correspondance peut
  y demander de traverser la ville, et le jeu de données ne dit pas de quelle gare il s'agit ;
- l'expansion est élaguée par dominance (on ne garde que la meilleure arrivée par gare, puis
  les `FRONTIER_CAP` meilleures) ;
- un itinéraire est renvoyé par heure de départ, le plus rapide partant à cette minute-là, et
  la liste est chronologique. Regrouper par gares intermédiaires ramenait toute une journée de
  trains à un seul « via Paris ».

Quand la date demandée ne donne rien, `feasible_next_days` parcourt toute la fenêtre réservable
en deux requêtes indexées pour suggérer les 3 prochaines dates qui marchent.

## Score de notoriété

`backend/tgvmax/data/popularity.json` associe à chaque gare un score dérivé du nombre d'éditions
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
| Backend | Django 6 + Django Ninja | Le propriétaire du projet est plus à l'aise en Python, et la logique la plus délicate (résolution des gares, BFS temporel) y est mieux maintenue sur la durée |
| Base | SQLite sur volume | Un écrivain par jour et des lectures : le profil exact où SQLite suffit. Aucun conteneur ni port de plus à durcir |
| File de tâches | django-tasks-db | Le cadre Tasks n'a ni backend base ni worker, en 6.0 comme en 6.1 ; ce paquet fournit les deux dans la même base |
| Planification | La tâche s'auto-programme | Aucun planificateur dans Django, mais `run_after` existe : chaque exécution arme la suivante. Rien à installer sur l'hôte, donc rien qu'un déploiement puisse oublier |
| Sauvegarde | Écrite par l'ingestion | Elle suit la seule écriture de la journée au lieu d'être une seconde minuterie qui espère assez d'écart |
| Fenêtre réservable | Déduite des données | Un `MIN`/`MAX` indexé plutôt qu'une constante de 30 jours : si l'horizon amont change, l'API suit sans modification |

## Ce que le projet n'est pas

Pas d'authentification, pas de comptes, pas de paiement, pas de publicité. Ce n'est pas un
oubli : c'est la raison d'être du projet, et ça ne changera pas.

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

```bash
uv run --directory backend pytest
```

La logique pure (normalisation de libellés, matching, groupement, itinéraires) est isolée dans
`backend/tgvmax/` et testée sans réseau, y compris contre les 341 libellés réels du dataset. Ce
qui reste côté TypeScript (`shared/normalize.ts`, `shared/window.ts`, `app/utils/trains.ts`) garde
ses tests Vitest.
