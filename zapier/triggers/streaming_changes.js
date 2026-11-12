const PROVIDERS = require('../providers')

const truthy = (v) => v !== false && v !== 'false' && v !== 'no'

module.exports = {
  key: 'streaming_changes',
  noun: 'Title',
  display: {
    label: 'Streaming Arrivals',
    description: 'Triggers when titles are added to or announced for a US streaming service.',
  },
  operation: {
    inputFields: [
      {
        key: 'provider',
        required: true,
        label: 'Service',
        choices: PROVIDERS,
        helpText: 'The US streaming service to watch.',
      },
      {
        key: 'include_coming',
        type: 'boolean',
        default: 'true',
        label: 'Include announced releases',
        helpText: 'Also trigger on titles announced but not yet streaming.',
      },
    ],
    perform: async (z, bundle) => {
      const res = await z.request({
        url: 'https://www.galaxymovies.app/api/streaming-changes',
        params: { provider: bundle.inputData.provider },
      })
      const { added = [], coming = [] } = res.data
      const items = truthy(bundle.inputData.include_coming) ? [...added, ...coming] : added
      // Stable id: a title that later moves coming->added dedupes to the same Zap run.
      return items.map((item) => ({
        ...item,
        id: `${bundle.inputData.provider}:${item.tmdbType}:${item.tmdbId}`,
      }))
    },
    sample: {
      id: 'netflix:movie:550',
      tmdbId: 550,
      tmdbType: 'movie',
      title: 'Fight Club',
      date: '2026-11-12',
      season: null,
    },
    outputFields: [
      { key: 'id', label: 'ID' },
      { key: 'tmdbId', label: 'TMDB ID', type: 'integer' },
      { key: 'tmdbType', label: 'Type' },
      { key: 'title', label: 'Title' },
      { key: 'year', label: 'Year', type: 'integer' },
      { key: 'date', label: 'Announced date', type: 'datetime' },
      { key: 'season', label: 'Season', type: 'integer' },
      { key: 'popularity', label: 'Popularity', type: 'number' },
    ],
  },
}
