# Trainquillou v2 — Design

**Date:** 2026-06-10
**Statut:** validé pour planification

## Contexte

Trainquille v1 est une application JavaScript vanilla (HTML + scripts dans le dossier `v1/`)
qui aide à trouver les destinations TGVmax réservables depuis une gare et une date données.
Elle interroge l'open data SNCF, affiche les destinations sur une carte Leaflet, propose
l'autocomplétion des gares et les dates de retour disponibles.

Problèmes de v1 :
- **Paywall** (`paywall-ultra.js`, `premium-blur.js`) limitant les recherches, avec un service
  d'auth (`auth-service.js`) et du tracking (`umami-tracking.js`).
- **UI/UX médiocre**, code dupliqué (3 variantes `script.*.js`) et non maintenable.

## Objectif v2

Reconstruire l'app — **trainquillou**, une **v2 meilleure, open source et gratuite** — avec
la même utilité de fond, **sans paywall ni login** (le login pourra devenir une feature future),
une UI/UX nettement meilleure, en **Nuxt 4 + TypeScript + Tailwind v4 + MapLibre GL**.

Non-objectifs (v2) :
- Authentification / comptes utilisateurs (reportés).
- Paiement, premium, tracking analytics.
- Refactoring de v1 (v1 reste tel quel comme référence).

## Décisions validées

| Sujet | Décision |
|-------|----------|
| Périmètre | Parité fonctionnelle complète avec v1 (recherche + carte + autocomplétion + dates de retour) |
| Carte | MapLibre GL (rendu vectoriel moderne) |
| Direction visuelle | **A — Map-first** : carte plein écran, recherche flottante, rail de résultats à gauche |
| Licence | **AGPL-3.0** (empêche un re-paywall d'une version hébergée modifiée) |
| Modèle | Open source, gratuit, sans clé secrète (API SNCF ouverte) |

## Architecture

### Vue d'ensemble

```
Navigateur (Nuxt/Vue, Direction A)
  SearchBar ─ ResultsRail ─ MapView (MapLibre)
        │ (fetch via $fetch, URL = source de vérité)
        ▼
Serveur Nitro (routes /api/*)  ── cache mémoire TTL ──┐
        │                                              │
        ▼                                              │
 enrichissement coords (stations.json) ◄───────────────┘
        │
        ▼
 Open data SNCF (dataset tgvmax) + référentiel gares
```

### Couche serveur (Nitro)

Isole la dépendance SNCF, règle le CORS, met en cache et **normalise** les données. Le client
ne parle qu'à nos routes, jamais directement à SNCF.

- `GET /api/stations`
  → liste des libellés de gares distincts (origines du dataset tgvmax) pour l'autocomplétion.
  Mise en cache longue (le set de gares bouge peu).

- `GET /api/search?origin=<libellé>&date=<YYYY-MM-DD>`
  → destinations réservables groupées depuis l'origine, **enrichies des coordonnées**
  (lat/lon origine + destination) côté serveur pour que le client soit prêt à mapper.
  Réponse normalisée :
  ```ts
  type SearchResult = {
    origin: { label: string; coords: [number, number] | null }
    date: string
    destinations: Array<{
      label: string
      coords: [number, number] | null
      trains: Array<{ departure: string; arrival: string; trainNumber: string | null }>
    }>
  }
  ```
  Cache TTL court (ex. 10 min) par couple origin+date.

- `GET /api/returns?origin=<dest aller>&dest=<origine aller>&from=<YYYY-MM-DD>`
  → dates de retour disponibles (réservables TGVmax) pour le trajet retour.
  Cache TTL court.

Filtrage métier (repris de v1) : ne garder que les enregistrements où `od_happy_card === 'OUI'`
(places TGVmax réservables), matching d'origine tolérant (normalisation accents/casse).

**Source API à confirmer en implémentation** : v1 utilise l'ancienne API Opendatasoft
`records/1.0`. Vérifier si l'API Explore v2.1
(`/api/explore/v2.1/catalog/datasets/tgvmax/records`) est préférable ; encapsuler l'appel dans
un seul module serveur (`server/utils/sncf.ts`) pour pouvoir changer de version sans toucher au reste.

### Coordonnées des gares

- Fichier `gares.json` (référentiel SNCF "liste-des-gares") fourni dans le repo. Champs utiles :
  `libelle`, `commune`, `x_wgs84` (longitude), `y_wgs84` (latitude).
- Au démarrage serveur, construire un index `clé normalisée → [lat, lon]` à partir de `libelle`
  et `commune` (comme `loadGaresJson` de v1), utilisé pour enrichir les résultats de recherche.
- Gares étrangères : dictionnaire en dur (repris de `garesEtrangeres` de v1) pour les libellés
  absents du référentiel français.
- Matching de libellé : exact d'abord, puis "contient", puis fallback (premier mot), tolérant
  aux accents et à la casse.

> ⚠️ Le `gares.json` actuellement présent est **tronqué à 1 Mo** (coupé en plein
> enregistrement). Il faut la version complète avant d'implémenter la carte. Tâche bloquante
> uniquement pour l'enrichissement coords / l'affichage carte, pas pour la recherche brute.

### Front (Direction A — map-first)

Layout plein écran : `MapView` MapLibre en fond, panneau de recherche flottant + rail de
résultats superposés à gauche.

Composants :
- `SearchBar` — saisie origine avec autocomplétion (`/api/stations`) + sélecteur de date.
  Déclenche la navigation vers `?origin=&date=`.
- `ResultsRail` — liste scrollable de `DestinationCard`.
- `DestinationCard` — destination, chips des heures de départ (titre = arrivée + n° train),
  bouton "Retours" qui déplie `ReturnDates`.
- `ReturnDates` — dates de retour disponibles (via `/api/returns`).
- `MapView` — markers origine + destinations, tracés origine→destination, survol/clic synchronisé
  avec le rail (hover sur une carte = highlight du marker et inversement).

Composables :
- `useStations()` — charge et filtre la liste de gares pour l'autocomplétion.
- `useSearch()` — lit `origin`/`date` depuis l'URL, appelle `/api/search`, expose état
  (loading / erreur / résultats).
- `useReturns()` — charge les dates de retour à la demande par destination.

État & navigation :
- **L'URL est la source de vérité** (`?origin=Paris&date=2026-06-29`). Recherches partageables,
  bouton retour navigateur fonctionnel, rechargement idempotent.
- Pas de Pinia (YAGNI) : `useState` + composables suffisent.

### Gestion des erreurs

- Champs manquants → message inline dans `SearchBar`, pas d'appel réseau.
- Erreur réseau / API SNCF indisponible → état d'erreur dans le rail avec bouton "Réessayer".
- Zéro résultat → état vide explicite ("Aucune destination TGVmax réservable ce jour-là").
- Coordonnées introuvables pour une gare → la destination reste listée dans le rail mais sans
  marker (jamais de crash carte).

### Tests

- **Unitaires** (Vitest) : normalisation de libellés, matching d'origine, construction de l'index
  de coordonnées, groupement/normalisation des résultats de recherche. Logique pure isolée dans
  `server/utils/`.
- **Composants** (@nuxt/test-utils + Vitest) : `SearchBar` (validation, émission), `DestinationCard`
  (rendu chips, toggle retours).
- Les routes serveur consomment des fixtures de réponse SNCF (pas d'appel réseau en test).

## Open source & gratuité

- `LICENSE` AGPL-3.0 à la racine.
- `README` : pitch ("trouver une destination TGVmax, gratuitement et sans compte"), setup,
  scripts, sources de données et attributions.
- Attributions : open data SNCF (dataset tgvmax + référentiel gares, licence ouverte/ODbL),
  fonds de carte OSM / fournisseur de tuiles, MapLibre.
- Aucune clé/secret dans le repo (API SNCF ouverte) → publiable tel quel.
- Mention "100% gratuit, sans paywall, sans compte" dans l'UI.

## Ce qu'on abandonne de v1

`paywall-ultra.js`, `premium-blur.js`, `auth-service.js`, `umami-tracking.js`, et les variantes
`script.giga.js` / `script.reverse.js` / `script.js`. Aucune reprise de code paywall/auth/tracking.

## Plan de livraison (phases pressenties)

1. **Setup** : Tailwind v4, structure projet, lint/format, CLAUDE.md, LICENSE, README, premier commit.
2. **Couche serveur** : module SNCF + index coords + routes `/api/stations`, `/api/search`,
   `/api/returns` (avec tests).
3. **Recherche + rail** : SearchBar (autocomplétion), URL-as-state, ResultsRail / DestinationCard.
4. **Carte** : MapView MapLibre, markers + tracés, synchro hover rail ↔ carte.
5. **Dates de retour** : ReturnDates + `/api/returns`.
6. **Finitions** : états vides/erreurs, responsive, accessibilité, polish visuel.

(Le découpage détaillé en tâches sera produit par l'étape writing-plans.)
