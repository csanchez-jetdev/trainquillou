<script setup lang="ts">
/**
 * Page « À propos ». Elle existe pour une raison précise : sans identité affichée,
 * sans méthode explicite et sans moyen de contact, un site qui affiche des
 * disponibilités de train ressemble à un agrégateur opaque. Ce sont exactement les
 * trois signaux que les audits de confiance cherchent, et les trois qu'un visiteur
 * cherche avant de suivre un lien de réservation.
 *
 * Prérendue (voir `nitro.prerender.routes`) : elle ne dépend d'aucune donnée
 * temps réel.
 */
const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')

const title = 'À propos de Trainquillou — qui, comment, avec quelles données'
const description
  = 'Qui maintient Trainquillou, d\'où viennent les disponibilités TGVmax / MAX JEUNE, '
    + 'à quelle fréquence elles sont rafraîchies, où le site est hébergé et comment nous joindre.'

useHead({
  title,
  link: [{ rel: 'canonical', href: `${base}/a-propos` }],
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: `${base}/a-propos` },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'AboutPage',
        name: title,
        url: `${base}/a-propos`,
        inLanguage: 'fr',
        mainEntity: {
          '@type': 'SoftwareApplication',
          name: 'Trainquillou',
          url: base,
          applicationCategory: 'TravelApplication',
          license: 'https://www.gnu.org/licenses/agpl-3.0.html',
          isAccessibleForFree: true,
        },
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: base },
          { '@type': 'ListItem', position: 2, name: 'À propos', item: `${base}/a-propos` },
        ],
      }),
    },
  ],
})
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
          <!-- Décoratif : le mot « Trainquillou » suit dans le même lien. -->
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            width="32"
            height="32"
            class="h-8 w-8 object-contain"
          >
          Trainquillou
        </NuxtLink>
        <div class="flex items-center gap-4">
          <GithubLink class="text-rail-soft transition hover:text-rail" />
          <NuxtLink to="/app" class="text-sm font-medium text-accent-strong hover:underline">
            Ouvrir l'application →
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">À propos</span>
      </nav>

      <h1 class="text-3xl font-extrabold leading-tight sm:text-4xl">
        À propos de <span class="text-gradient">Trainquillou</span>
      </h1>

      <p class="mt-5 text-lg leading-relaxed text-rail-soft">
        Trainquillou est un projet indépendant, né d'un besoin très simple : savoir
        <em>où</em> l'abonnement TGVmax (aujourd'hui MAX JEUNE) permet d'aller un jour donné,
        plutôt que de tester les villes une par une dans un moteur de réservation. La réponse
        existe dans les données ouvertes de la SNCF ; il manquait juste une carte pour la lire.
      </p>

      <p class="mt-4 leading-relaxed text-rail-soft">
        Le site est développé et maintenu par <strong class="text-rail">Clément</strong>, sur son
        temps libre, et son code est public sous licence AGPL-3.0 : chacun peut le lire, le
        vérifier, le corriger ou en faire tourner sa propre instance. Il est gratuit et le
        restera — pas d'offre payante en préparation, pas de fonctionnalité gardée derrière un
        compte.
      </p>

      <!-- MÉTHODE -->
      <section class="mt-12">
        <h2 class="text-2xl font-bold">D'où viennent les disponibilités</h2>
        <p class="mt-3 leading-relaxed text-rail-soft">
          D'une seule source, publique et citable : le jeu de données
          <a
            class="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            href="https://ressources.data.sncf.com/explore/dataset/tgvmax/"
            target="_blank"
            rel="noopener"
          >« Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR ouvertes à la réservation »</a>
          publié par la SNCF en open data. Aucune autre origine, aucun contournement de site de
          réservation, aucune donnée achetée.
        </p>
        <dl class="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div class="p-5">
            <dt class="font-semibold text-rail">Ce que le jeu de données contient</dt>
            <dd class="mt-1.5 text-sm leading-relaxed text-rail-soft">
              La liste des trajets origine-destination sur une fenêtre glissante de 30 jours, avec
              pour chacun un indicateur : des places d'abonnement sont ouvertes à la réservation,
              ou non. Trainquillou ne garde que les premiers. C'est la SNCF qui publie cet
              indicateur, nous ne le calculons pas.
            </dd>
          </div>
          <div class="p-5">
            <dt class="font-semibold text-rail">Fenêtre de 30 jours</dt>
            <dd class="mt-1.5 text-sm leading-relaxed text-rail-soft">
              Ce n'est pas une limite que le site s'impose : les places d'abonnement n'ouvrent que
              30 jours avant le départ, et le jeu de données ne contient rien au-delà. Le
              sélecteur de date s'arrête donc là.
            </dd>
          </div>
          <div class="p-5">
            <dt class="font-semibold text-rail">Fraîcheur</dt>
            <dd class="mt-1.5 text-sm leading-relaxed text-rail-soft">
              La SNCF rafraîchit le jeu de données chaque jour en début de matinée. Pour ne pas
              marteler son API, Trainquillou garde chaque recherche 10 minutes en cache côté
              serveur, et la liste des gares 6 heures. Une place peut donc partir entre le moment
              où elle s'affiche ici et celui où vous la réservez.
            </dd>
          </div>
          <div class="p-5">
            <dt class="font-semibold text-rail">Ce que le site ne sait pas faire</dt>
            <dd class="mt-1.5 text-sm leading-relaxed text-rail-soft">
              Il n'accède pas à votre abonnement, ne réserve rien, ne connaît pas le nombre de
              places restantes sur un train, et ne distingue pas MAX JEUNE de MAX SENIOR : le jeu
              de données publie un seul indicateur pour les deux. Il vous montre où chercher, la
              réservation se fait sur SNCF Connect.
            </dd>
          </div>
        </dl>
      </section>

      <!-- HÉBERGEMENT -->
      <section class="mt-12">
        <h2 class="text-2xl font-bold">Où le site est hébergé</h2>
        <p class="mt-3 leading-relaxed text-rail-soft">
          Sur un serveur privé virtuel loué chez <strong class="text-rail">OVH</strong>, dans son
          centre de données de <strong class="text-rail">Gravelines</strong> (Nord, France). Pas de
          CDN intermédiaire, pas de réplication hors de France : les requêtes vont du navigateur à
          cette machine, et nulle part ailleurs. Seul le fond de carte est servi par un tiers,
          <a
            class="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            href="https://openfreemap.org"
            target="_blank"
            rel="noopener"
          >OpenFreeMap</a>, à partir des données d'OpenStreetMap.
        </p>
        <p class="mt-4 text-sm leading-relaxed text-rail-soft">
          Hébergeur : OVH SAS, 2 rue Kellermann, 59100 Roubaix, France — RCS Lille Métropole
          424 761 419.
        </p>
      </section>

      <!-- VIE PRIVÉE -->
      <section class="mt-12">
        <h2 class="text-2xl font-bold">Ce que le site mesure</h2>
        <p class="mt-3 leading-relaxed text-rail-soft">
          Le strict nécessaire pour savoir si quelqu'un s'en sert. L'instance officielle utilise
          <a
            class="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            href="https://rybbit.com"
            target="_blank"
            rel="noopener"
          >Rybbit</a>, une mesure d'audience open source qui fonctionne
          <strong class="text-rail">sans cookie</strong>, sans identifiant persistant et sans
          stocker les adresses IP. Il n'y a ni régie publicitaire, ni traceur commercial, ni
          revente, ni profilage — et donc rien à accepter dans une bannière.
        </p>
        <p class="mt-4 leading-relaxed text-rail-soft">
          Le site lui-même ne demande aucun compte et n'enregistre aucune donnée personnelle : vos
          recherches vivent dans l'URL de votre navigateur, pas dans une base. Une instance
          auto-hébergée n'a par défaut aucune mesure d'audience du tout — elle s'active par
          variable d'environnement au moment de la construction.
        </p>
      </section>

      <!-- CONTACT -->
      <section class="mt-12">
        <h2 class="text-2xl font-bold">Nous écrire, contribuer</h2>
        <p class="mt-3 leading-relaxed text-rail-soft">
          Un libellé de gare mal placé sur la carte, une destination manquante, une idée, un
          désaccord : tout passe par le dépôt GitHub, qui sert à la fois de boîte aux lettres et
          d'historique public des corrections. Les signalements y sont visibles de tous, ce qui
          vaut mieux qu'un e-mail privé pour un projet ouvert.
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <a
            href="https://github.com/csanchez-jetdev/trainquillou/issues"
            target="_blank"
            rel="noopener"
            class="rounded-xl bg-rail px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rail/90"
          >
            Signaler quelque chose
          </a>
          <GithubLink
            label="Voir le code source"
            class="rounded-xl bg-white px-6 py-3 font-semibold text-rail ring-1 ring-slate-200 transition hover:ring-accent"
          />
        </div>
        <p class="mt-6 text-sm leading-relaxed text-rail-soft">
          Trainquillou n'est pas affilié à la SNCF, ne vend pas de billets et ne touche aucune
          commission sur les liens vers SNCF Connect ou Trainline.
        </p>
      </section>

      <div class="relative mt-14 overflow-hidden rounded-3xl bg-gradient-to-br from-rail via-rail to-accent-strong px-6 py-12 text-center">
        <h2 class="relative text-2xl font-bold text-white">Voir où vous pouvez partir</h2>
        <NuxtLink
          to="/app"
          class="relative mt-5 inline-block rounded-xl bg-coral px-8 py-3 font-semibold text-white shadow-lg shadow-coral/40 transition hover:-translate-y-0.5 hover:bg-coral-strong"
        >
          Ouvrir la carte →
        </NuxtLink>
      </div>
    </main>

    <footer class="border-t border-slate-200 py-8">
      <div class="mx-auto max-w-3xl px-5 text-center text-sm text-rail-soft sm:px-8">
        <NuxtLink to="/" class="underline hover:text-rail">Retour à l'accueil</NuxtLink>
      </div>
    </footer>
  </div>
</template>
