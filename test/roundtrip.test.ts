import { describe, it, expect } from 'vitest'
import { groupRoundTrip } from '~~/server/utils/sncf'
import type { RawRecord } from '~~/server/utils/sncf'

function rec(over: Partial<RawRecord>): RawRecord {
  return {
    date: '2026-08-14',
    train_no: '1000',
    origine: 'PARIS (intramuros)',
    destination: 'MARSEILLE ST CHARLES',
    heure_depart: '10:00',
    heure_arrivee: '13:00',
    od_happy_card: 'OUI',
    ...over,
  }
}

describe('groupRoundTrip', () => {
  it('ne garde que les destinations dont l\'aller et le retour sont réservables', () => {
    const outbound = [
      rec({ destination: 'MARSEILLE ST CHARLES' }),
      rec({ destination: 'BORDEAUX ST JEAN' }),
      rec({ destination: 'NANTES' }),
    ]
    // Retour : ces enregistrements arrivent au hub, leur `origine` est la destination.
    const inbound = [
      rec({ origine: 'MARSEILLE ST CHARLES', destination: 'PARIS (intramuros)' }),
      rec({ origine: 'NANTES', destination: 'PARIS (intramuros)' }),
    ]
    const result = groupRoundTrip(outbound, inbound)
    expect(result.map((d) => d.label)).toEqual(['MARSEILLE ST CHARLES', 'NANTES'])
  })

  it('porte les trains des deux sens séparément', () => {
    const outbound = [
      rec({ destination: 'LYON (intramuros)', heure_depart: '08:00', heure_arrivee: '10:00', train_no: '6601' }),
      rec({ destination: 'LYON (intramuros)', heure_depart: '18:00', heure_arrivee: '20:00', train_no: '6699' }),
    ]
    const inbound = [
      rec({ origine: 'LYON (intramuros)', destination: 'PARIS (intramuros)', heure_depart: '17:30', train_no: '6700' }),
    ]
    const [dest] = groupRoundTrip(outbound, inbound)
    expect(dest!.trains.map((t) => t.departure)).toEqual(['08:00', '18:00'])
    expect(dest!.returnTrains!.map((t) => t.departure)).toEqual(['17:30'])
    expect(dest!.trains[0]!.trainNumber).toBe('6601')
  })

  it('trie les trains de chaque sens par heure de départ', () => {
    const outbound = [
      rec({ destination: 'NICE VILLE', heure_depart: '15:00' }),
      rec({ destination: 'NICE VILLE', heure_depart: '07:00' }),
    ]
    const inbound = [
      rec({ origine: 'NICE VILLE', destination: 'PARIS (intramuros)', heure_depart: '20:00' }),
      rec({ origine: 'NICE VILLE', destination: 'PARIS (intramuros)', heure_depart: '09:00' }),
    ]
    const [dest] = groupRoundTrip(outbound, inbound)
    expect(dest!.trains.map((t) => t.departure)).toEqual(['07:00', '15:00'])
    expect(dest!.returnTrains!.map((t) => t.departure)).toEqual(['09:00', '20:00'])
  })

  it('ignore les trains sans place TGVmax dans les deux sens', () => {
    const outbound = [
      rec({ destination: 'RENNES', od_happy_card: 'NON' }),
      rec({ destination: 'BREST', od_happy_card: 'OUI' }),
    ]
    const inbound = [
      rec({ origine: 'RENNES', destination: 'PARIS (intramuros)', od_happy_card: 'OUI' }),
      rec({ origine: 'BREST', destination: 'PARIS (intramuros)', od_happy_card: 'NON' }),
    ]
    // Rennes n'a pas d'aller réservable, Brest pas de retour : aucune escapade possible.
    expect(groupRoundTrip(outbound, inbound)).toEqual([])
  })

  it('rapproche les deux sens malgré la casse et les accents', () => {
    const outbound = [rec({ destination: 'BESANÇON FRANCHE COMTÉ TGV' })]
    const inbound = [rec({ origine: 'besancon franche comte tgv', destination: 'PARIS (intramuros)' })]
    const result = groupRoundTrip(outbound, inbound)
    expect(result).toHaveLength(1)
    // Le libellé retenu est celui de l'aller, tel que SNCF l'écrit.
    expect(result[0]!.label).toBe('BESANÇON FRANCHE COMTÉ TGV')
  })

  it('renvoie une liste vide quand un sens est vide', () => {
    expect(groupRoundTrip([rec({})], [])).toEqual([])
    expect(groupRoundTrip([], [rec({})])).toEqual([])
  })

  it('trie les destinations par libellé', () => {
    const outbound = [
      rec({ destination: 'TOULOUSE MATABIAU' }),
      rec({ destination: 'ANGERS SAINT LAUD' }),
      rec({ destination: 'MARSEILLE ST CHARLES' }),
    ]
    const inbound = outbound.map((r) =>
      rec({ origine: r.destination, destination: 'PARIS (intramuros)' }),
    )
    expect(groupRoundTrip(outbound, inbound).map((d) => d.label)).toEqual([
      'ANGERS SAINT LAUD',
      'MARSEILLE ST CHARLES',
      'TOULOUSE MATABIAU',
    ])
  })
})
