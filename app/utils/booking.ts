/**
 * URL de réservation vers les deux revendeurs, construites depuis les slugs de ville
 * vérifiés par scripts/build-booking.py.
 *
 * Ni SNCF Connect ni Trainline n'exposent de lien profond vers une recherche
 * pré-remplie : leurs formulaires sont pilotés en JavaScript, sans `action`, et les
 * boutons « Réserver » de leurs pages horaires n'ont pas de `href`. Leur seule surface
 * publique adressable est la page horaires d'une paire de villes — sans la date, que
 * l'utilisateur devra donc choisir à l'arrivée.
 */

/** SNCF Connect génère ces pages pour des paires arbitraires. */
export function sncfConnectUrl(fromSlug: string, toSlug: string): string {
  return `https://www.sncf-connect.com/train/horaires/${fromSlug}/${toSlug}`
}

/**
 * Trainline ne publie ces pages que pour les liaisons fréquentées : une liaison rare
 * peut tomber sur leur 404. C'est pour cette raison un lien secondaire.
 */
export function trainlineUrl(fromSlug: string, toSlug: string): string {
  return `https://www.thetrainline.com/fr/horaires-train/${fromSlug}-a-${toSlug}`
}
