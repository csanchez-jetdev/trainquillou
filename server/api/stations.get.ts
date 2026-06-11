import { fetchStationLabels } from '../utils/sncf'

export default defineCachedEventHandler(
  async (): Promise<string[]> => {
    return fetchStationLabels()
  },
  { maxAge: 60 * 60 * 6, name: 'stations', getKey: () => 'all' },
)
