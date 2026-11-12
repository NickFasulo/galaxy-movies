const assert = require('assert')
const zapier = require('zapier-platform-core')
const App = require('..')

const appTester = zapier.createAppTester(App)

describe('streaming_changes trigger', () => {
  it('emits items with stable provider-scoped ids', async () => {
    const bundle = { inputData: { provider: 'netflix' } }
    const items = await appTester(App.triggers.streaming_changes.operation.perform, bundle)
    assert(items.length > 0, 'expected items')
    for (const item of items) {
      assert.match(item.id, /^netflix:(movie|tv):\d+$/)
      assert(item.title)
      assert(item.tmdbType)
    }
  })

  it('include_coming=false emits only added items', async () => {
    const bundle = { inputData: { provider: 'hulu', include_coming: false } }
    const items = await appTester(App.triggers.streaming_changes.operation.perform, bundle)
    const all = await appTester(App.triggers.streaming_changes.operation.perform, {
      inputData: { provider: 'hulu', include_coming: true },
    })
    assert(items.length <= all.length)
  })

  it('unknown provider surfaces the API error', async () => {
    const bundle = { inputData: { provider: 'bogus' } }
    await assert.rejects(
      appTester(App.triggers.streaming_changes.operation.perform, bundle),
      /bogus/,
    )
  })
})

describe('where_to_watch search', () => {
  it('resolves a title to provider lists', async () => {
    const bundle = { inputData: { title: 'fight club' } }
    const [d] = await appTester(App.searches.where_to_watch.operation.perform, bundle)
    assert.strictEqual(d.tmdbId, 550)
    assert.strictEqual(d.tmdbType, 'movie')
    for (const kind of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
      assert(Array.isArray(d[kind]), `${kind} should be an array`)
      assert.strictEqual(typeof d[`${kind}_names`], 'string')
    }
    assert(d.url.startsWith('https://www.galaxymovies.app/'))
  })

  it('passes year/type/region through', async () => {
    const bundle = { inputData: { title: 'the bear', type: 'tv', region: 'US' } }
    const [d] = await appTester(App.searches.where_to_watch.operation.perform, bundle)
    assert.strictEqual(d.tmdbType, 'tv')
  })

  it('unknown titles surface the API error', async () => {
    const bundle = { inputData: { title: 'zzzznotarealtitleqqq' } }
    await assert.rejects(
      appTester(App.searches.where_to_watch.operation.perform, bundle),
    )
  })
})
