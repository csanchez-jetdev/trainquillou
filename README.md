# Trainquillou

Trouvez les destinations **TGVmax** réservables depuis votre gare, sur une carte interactive.
**100% gratuit, sans paywall, sans compte.**

## Stack

Nuxt 4 · TypeScript · Tailwind v4 · MapLibre GL · open data SNCF.

## Développement

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm test     # tests unitaires + composants
pnpm build    # build production
```

## Données & attributions

- Disponibilités TGVmax : [open data SNCF — dataset `tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/).
- Coordonnées des gares : référentiel SNCF « liste-des-gares ».
- Fonds de carte : OpenStreetMap, rendu MapLibre GL.

Données sous licence ouverte / ODbL. Voir attributions dans l'application.

## Licence

[AGPL-3.0](./LICENSE). Toute version hébergée modifiée doit republier son code source.
