const streamingChanges = require('./triggers/streaming_changes')
const whereToWatch = require('./searches/where_to_watch')

module.exports = {
  version: require('./package.json').version,
  platformVersion: require('zapier-platform-core').version,

  // The API is keyless by design — 'custom' auth with no fields; the test URL
  // just gives Zapier a connectivity check.
  authentication: {
    type: 'custom',
    fields: [],
    connectionLabel: 'Galaxy Movies',
    test: { url: 'https://www.galaxymovies.app/api/streaming-changes?provider=netflix' },
  },

  flags: { cleanInputData: false },

  triggers: {
    [streamingChanges.key]: streamingChanges,
  },
  searches: {
    [whereToWatch.key]: whereToWatch,
  },
}
