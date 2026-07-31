# Notes sur l'API open data SNCF (dataset `tgvmax`)

Faits vérifiés en implémentant Trainquillou. Utile si vous attaquez ce dataset pour votre propre
projet — plusieurs de ces comportements ne sont pas documentés côté SNCF.

Toute la couche d'accès est isolée dans [`server/utils/sncf.ts`](../server/utils/sncf.ts).

## Endpoint

```
GET https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records
```

Exemple de requête valide :

```
?refine=date:2026-08-14
&refine=od_happy_card:OUI
&where=origine like "PARIS"
&limit=100
```

Aucune clé d'API n'est nécessaire : le dataset est ouvert.

## Schéma d'un enregistrement

Les champs sont **à plat** dans `results[]` (pas de `fields` imbriqué comme dans l'ancienne API
`records/1.0`) :

| Champ | Exemple | Note |
|---|---|---|
| `date` | `"2026-08-14"` | Date de circulation |
| `train_no` | `"6607"` | Numéro de train |
| `origine` | `"PARIS (intramuros)"` | Libellé SNCF, pas un code gare |
| `destination` | `"MARSEILLE ST CHARLES"` | idem |
| `heure_depart` | `"14:58"` | Chaîne `HH:MM`, pas un timestamp |
| `heure_arrivee` | `"18:16"` | Peut être **antérieure** au départ : trajet passant minuit |
| `od_happy_card` | `"OUI"` / `"NON"` | **Le champ décisif** — voir plus bas |
| `origine_iata`, `destination_iata`, `axe`, `entity` | | Non utilisés ici |

## Le champ `od_happy_card` est le seul qui compte

`OUI` signifie qu'il reste des places réservables avec l'abonnement TGVmax sur ce train. Sans ce
filtre, vous affichez des trains que l'abonnement ne couvre pas :

```
&refine=od_happy_card:OUI
```

## Pièges

### `where date="..."` échoue

Filtrer la date via une expression `where` renvoie `IncompatibleTypesInComparisonFilter`.
Il faut passer par `refine` :

```
refine=date:2026-08-14        ✅
where=date="2026-08-14"       ❌ IncompatibleTypesInComparisonFilter
```

En revanche, la comparaison de plage fonctionne avec le littéral `date'...'` :

```
where=date >= date'2026-08-14' and date <= date'2026-08-21'   ✅
```

### `limit` est plafonné à 100

Le maximum est 100 par requête. `total_count` donne le total réel ; il faut paginer via `offset`.
En pratique, une origine + une date dépasse rarement 100 trains réservables (Paris tourne autour
de 50), mais une requête sur une plage de dates les dépasse largement.

### L'heure d'arrivée peut précéder l'heure de départ

Un train partant à `23:40` et arrivant à `01:15` donne `heure_arrivee < heure_depart`. Tout calcul
de durée doit ajouter 1440 minutes dans ce cas, sinon la durée devient négative.

### La liste des gares passe par les facettes, et elle est plafonnée aussi

```
GET .../tgvmax/facets?facet=origine
→ facets[0].facets[] = [{ name: "PARIS (intramuros)", count: 51 }, …]
```

Environ 100 valeurs, plafonnées à 100. Il faut faire l'**union** de `facet=origine` et
`facet=destination` : certaines gares ne sont jamais origine et manqueraient sinon.

### Les libellés ne correspondent à aucun autre référentiel

`"PARIS (intramuros)"` n'existe pas dans le référentiel « liste des gares », qui parle de
`"Paris-Gare-de-Lyon"`. Croiser les deux exige un matching tolérant (accents, casse,
ponctuation, communes) — voir [`server/utils/stations.ts`](../server/utils/stations.ts).

Les gares étrangères (Bruxelles, Genève, Luxembourg, Barcelone…) sont absentes du référentiel
français et demandent un dictionnaire dédié.

## Référentiel des coordonnées

Le dataset « liste des gares » fournit un tableau d'objets dont les champs utiles sont :

```jsonc
{
  "libelle": "Paris-Gare-de-Lyon",
  "commune": "PARIS",
  "x_wgs84": 2.373520455491338,  // longitude
  "y_wgs84": 48.84430057171583   // latitude
}
```

Le référentiel embarqué compte 6 469 gares, avec des **doublons de libellé** (`Paris-Gare-de-Lyon`
apparaît deux fois, à des coordonnées légèrement différentes) : l'index doit décider quelle
occurrence gagne plutôt que de supposer l'unicité.

Attention à l'ordre : `x` est la **longitude**, `y` la **latitude**. MapLibre attend
`[lon, lat]`, l'inverse de la convention usuelle.

## Licence des données

Les jeux de données SNCF Open Data sont diffusés sous **ODbL** : attribution obligatoire et
partage à l'identique des bases dérivées. Si vous redistribuez un fichier dérivé de ces données,
il doit rester sous ODbL — y compris dans un projet dont le code porte une autre licence.

- [Dataset `tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/)
- [Licence SNCF Open Data](https://data.sncf.com/pages/licence)
