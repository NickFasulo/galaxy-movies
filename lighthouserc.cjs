module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 120000,
      numberOfRuns: 1,
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/movies/969681',
        'http://localhost:3000/streaming',
        'http://localhost:3000/streaming-in-india',
        'http://localhost:3000/browse/bollywood'
      ],
      settings: {
        preset: 'desktop',
        maxWaitForLoad: 60000,
        pauseAfterLoadMs: 5000,
        chromeFlags: '--headless=new --disable-gpu --no-sandbox',
        onlyCategories: [
          'performance',
          'accessibility',
          'best-practices',
          'seo'
        ]
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.75 }],
        'categories:accessibility': ['error', { minScore: 0.9 }],
        'categories:best-practices': ['error', { minScore: 0.9 }],
        'categories:seo': ['error', { minScore: 0.9 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }]
      }
    },
    upload: {
      target: 'temporary-public-storage'
    }
  }
}
