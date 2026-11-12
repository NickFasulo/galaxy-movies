const names = (list) => (list || []).map((p) => p.name)

module.exports = {
  key: 'where_to_watch',
  noun: 'Title',
  display: {
    label: 'Find Where to Watch',
    description: 'Look up which services stream a movie or TV show (subscription, free, ads, rent, buy).',
  },
  operation: {
    inputFields: [
      { key: 'title', required: true, label: 'Title', helpText: 'e.g. "fight club"' },
      { key: 'year', required: false, type: 'integer', label: 'Year', helpText: 'Release year, to disambiguate.' },
      { key: 'region', required: false, label: 'Region', default: 'US', helpText: '2-letter country code.' },
      {
        key: 'type',
        required: false,
        label: 'Type',
        choices: { movie: 'Movie', tv: 'TV show' },
      },
    ],
    perform: async (z, bundle) => {
      const params = { title: bundle.inputData.title }
      for (const k of ['year', 'region', 'type']) {
        if (bundle.inputData[k]) params[k] = bundle.inputData[k]
      }
      const res = await z.request({ url: 'https://www.galaxymovies.app/api/ext/where', params })
      const d = res.data
      const providers = d.providers || {}
      // Line-item arrays for Zapier loops, joined strings for text fields.
      const out = {
        tmdbId: d.tmdbId,
        tmdbType: d.tmdbType,
        title: d.title,
        year: d.year,
        url: d.url,
      }
      for (const kind of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
        const n = names(providers[kind])
        out[kind] = n
        out[`${kind}_names`] = n.join(', ')
      }
      return [out]
    },
    sample: {
      tmdbId: 550,
      tmdbType: 'movie',
      title: 'Fight Club',
      year: 1999,
      url: 'https://www.galaxymovies.app/movies/550',
      flatrate: [],
      free: [],
      ads: ['Pluto TV'],
      rent: ['Amazon Video', 'Apple TV Store'],
      buy: ['Amazon Video', 'Apple TV Store'],
      flatrate_names: '',
      free_names: '',
      ads_names: 'Pluto TV',
      rent_names: 'Amazon Video, Apple TV Store',
      buy_names: 'Amazon Video, Apple TV Store',
    },
  },
}
