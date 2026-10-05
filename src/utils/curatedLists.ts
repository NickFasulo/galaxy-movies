// TMDB keyword ids below were verified via /search/keyword + spot-checked against
// /discover/movie — do not add lists with unverified ids (they silently return
// empty or irrelevant results).
export const curatedLists = {
  'cozy-night-in': {
    title: 'Cozy Night In Movies',
    tagline: 'Warm, low-commitment comfort watches for a quiet night at home.',
    group: 'mood',
    params: {
      with_genres: '35,10751|10749',
      'vote_average.gte': 6.5,
      'vote_count.gte': 200,
      'with_runtime.lte': 115,
      sort_by: 'popularity.desc'
    }
  },
  'quick-watch-under-90': {
    title: 'Great Movies Under 90 Minutes',
    tagline: 'No filler — solid films that respect your evening.',
    group: 'mood',
    params: {
      'with_runtime.lte': 90,
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  },
  'epic-weekend-marathon': {
    title: 'Epic Weekend Marathon Picks',
    tagline: "Sprawling, immersive films worth clearing your schedule for.",
    group: 'mood',
    params: {
      'with_runtime.gte': 150,
      'vote_average.gte': 6.8,
      'vote_count.gte': 300,
      sort_by: 'popularity.desc'
    }
  },
  'date-night-picks': {
    title: 'Date Night Movie Picks',
    tagline: 'Crowd-pleasing romance and comedy for watching together.',
    group: 'mood',
    params: {
      with_genres: '10749,35',
      'vote_average.gte': 6.5,
      'vote_count.gte': 200,
      sort_by: 'popularity.desc'
    }
  },
  'family-movie-night': {
    title: 'Family Movie Night Picks',
    tagline: 'Animated and family-friendly favorites for watching with kids.',
    group: 'mood',
    params: {
      with_genres: '10751,16',
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  },
  'mind-bending-thrillers': {
    title: 'Mind-Bending Thrillers',
    tagline: 'Twist-heavy thrillers and mysteries that reward close attention.',
    group: 'curated',
    params: {
      with_genres: '53,9648',
      'vote_average.gte': 7,
      'vote_count.gte': 400,
      sort_by: 'vote_average.desc'
    }
  },
  'edge-of-your-seat-action': {
    title: 'Edge-of-Your-Seat Action',
    tagline: 'High-adrenaline action and thrillers that rarely let up.',
    group: 'curated',
    params: {
      with_genres: '28,53',
      'vote_average.gte': 6.7,
      'vote_count.gte': 400,
      sort_by: 'popularity.desc'
    }
  },
  'underrated-90s-gems': {
    title: 'Underrated 90s Gems',
    tagline: 'Well-reviewed 90s films that never got the audience they deserved.',
    group: 'curated',
    params: {
      'primary_release_date.gte': '1990-01-01',
      'primary_release_date.lte': '1999-12-31',
      'vote_average.gte': 7,
      'vote_count.gte': 100,
      'vote_count.lte': 2500,
      sort_by: 'vote_average.desc'
    }
  },
  'acclaimed-documentaries': {
    title: 'Acclaimed Documentaries',
    tagline: 'Highly rated documentaries worth your time.',
    group: 'curated',
    params: {
      with_genres: '99',
      'vote_average.gte': 7,
      'vote_count.gte': 100,
      sort_by: 'vote_average.desc'
    }
  },

  'heist-movies': {
    title: 'Best Heist Movies',
    tagline: 'Elaborate cons, big scores, and crews with a plan — or the confidence to fake one.',
    group: 'curated',
    params: {
      with_keywords: '10051', // heist
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  },
  'time-travel-movies': {
    title: 'Time Travel Movies',
    tagline: 'Stories that bend the timeline, from tidy paradoxes to full time-loop chaos.',
    group: 'curated',
    params: {
      with_keywords: '4379', // time travel
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  },
  'dystopian-post-apocalyptic': {
    title: 'Dystopian & Post-Apocalyptic Movies',
    tagline: 'Bleak futures, collapsed societies, and the people trying to survive them.',
    group: 'curated',
    params: {
      with_keywords: '359337|4565', // post-apocalyptic OR dystopia
      'vote_average.gte': 6.5,
      'vote_count.gte': 100,
      sort_by: 'popularity.desc'
    }
  },
  'true-story-movies': {
    title: 'Movies Based on a True Story',
    tagline: 'Real events and real people, dramatized for the screen.',
    group: 'curated',
    params: {
      with_keywords: '9672', // based on true story
      'vote_average.gte': 7,
      'vote_count.gte': 300,
      sort_by: 'vote_average.desc'
    }
  },
  'coming-of-age-movies': {
    title: 'Coming-of-Age Movies',
    tagline: 'Growing up, first heartbreaks, and figuring out who you are.',
    group: 'mood',
    params: {
      with_keywords: '10683', // coming of age
      'vote_average.gte': 6.5,
      'vote_count.gte': 200,
      sort_by: 'popularity.desc'
    }
  },
  'prison-escape-thrillers': {
    title: 'Prison Escape Thrillers',
    tagline: 'Lockdowns, plans, and the tension of trying to get out.',
    group: 'curated',
    params: {
      with_keywords: '9777', // prison escape
      'vote_average.gte': 6.5,
      'vote_count.gte': 80,
      sort_by: 'popularity.desc'
    }
  },
  'ai-and-machines': {
    title: 'Artificial Intelligence Movies',
    tagline: 'Sentient machines, rogue AI, and questions about what makes us human.',
    group: 'curated',
    params: {
      with_keywords: '310', // artificial intelligence (a.i.)
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  },
  'road-trip-movies': {
    title: 'Road Trip Movies',
    tagline: 'Movies about the journey as much as the destination.',
    group: 'mood',
    params: {
      with_keywords: '7312', // road trip
      'vote_average.gte': 6.5,
      'vote_count.gte': 150,
      sort_by: 'popularity.desc'
    }
  }
}

export function getCuratedList(slug) {
  return curatedLists[slug] || null
}
