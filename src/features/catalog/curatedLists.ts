import type { MediaType } from '../../types/tmdb'
import { ANIME_PARAMS, type TmdbParams } from './tmdb'

interface BaseListDef {
  title: string
  tagline: string
  group: string
  media?: MediaType
  keyword?: string
  createdAt?: number
}

export interface DiscoverListDef extends BaseListDef {
  type?: 'discover'
  params: TmdbParams
  movieId?: undefined
}

export interface SimilarListDef extends BaseListDef {
  type: 'similar'
  movieId: number
  movieTitle: string
  params?: undefined
}

export interface EditorialItem {
  name: string
  description: string
  url?: string
  path?: string
  pathLabel?: string
  kind?: 'podcast' | 'book'
}

export interface EditorialSection {
  heading?: string
  paragraphs?: string[]
  items?: EditorialItem[]
}

// Editorial lists are prose guides, not TMDB queries — sections carry the
// content and relatedParams optionally appends a discover grid at the bottom.
export interface EditorialListDef extends BaseListDef {
  type: 'editorial'
  params?: undefined
  movieId?: undefined
  sections: EditorialSection[]
  relatedParams?: TmdbParams
  relatedHeading?: string
}

export type ListDef = DiscoverListDef | SimilarListDef | EditorialListDef

// TMDB keyword ids below were verified via /search/keyword + spot-checked against
// /discover/movie — do not add lists with unverified ids (they silently return
// empty or irrelevant results).
export const curatedLists: Record<string, ListDef> = {
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
  },

  'best-anime-series': {
    title: 'Best Anime Series',
    tagline: 'The top-rated anime shows of all time — modern hits and all-time classics.',
    group: 'curated',
    media: 'tv',
    params: {
      ...ANIME_PARAMS,
      'vote_average.gte': 7.5,
      'vote_count.gte': 300,
      sort_by: 'vote_average.desc'
    }
  },
  'best-anime-movies': {
    title: 'Best Anime Movies',
    tagline: 'The essential anime films — Ghibli classics, modern masterpieces, and theatrical hits.',
    group: 'curated',
    params: {
      ...ANIME_PARAMS,
      'vote_average.gte': 7,
      'vote_count.gte': 300,
      sort_by: 'vote_average.desc'
    }
  },
  'studio-ghibli-essentials': {
    title: 'Studio Ghibli Essentials',
    tagline: 'Every essential film from the legendary studio, ranked by audience score.',
    group: 'curated',
    params: {
      with_companies: '10342', // Studio Ghibli
      'vote_count.gte': 100,
      sort_by: 'vote_average.desc'
    }
  },

  // Editorial guides — prose content with outbound/internal links, no TMDB
  // discover params for the body (relatedParams only feeds the trailing grid).
  'best-movie-podcasts': {
    type: 'editorial',
    title: 'Best Podcasts for Movie Lovers',
    tagline: 'Smart film podcasts for every mood — deep dives, director retrospectives, awards chatter and Hollywood history.',
    group: 'guides',
    relatedParams: {
      'primary_release_date.gte': '2025-01-01',
      'vote_average.gte': 7,
      'vote_count.gte': 300,
      sort_by: 'popularity.desc'
    },
    relatedHeading: 'Highly rated recent releases for your queue',
    sections: [
      {
        paragraphs: [
          'Love movies but short on screen time? A good film podcast keeps the conversation going between watches — recommendations, context and arguments you\'ll want to pick a side on. These shows are worth a permanent slot in your podcast queue, whether you want weekly reviews, director deep dives or Hollywood history.'
        ]
      },
      {
        heading: 'The rotation',
        items: [
          {
            name: 'The Big Picture',
            kind: 'podcast',
            url: 'https://www.theringer.com/the-big-picture',
            description: 'The Ringer\'s flagship movie show — Sean Fennessey, Amanda Dobbins and guests cover new releases, then break for obsessively ranked movie drafts and top-five lists.'
          },
          {
            name: 'Filmspotting',
            kind: 'podcast',
            url: 'https://www.filmspotting.net',
            description: 'One of the longest-running movie podcasts around — weekly reviews plus the famous Top 5 lists that will send your watchlist spiraling.'
          },
          {
            name: 'Blank Check',
            kind: 'podcast',
            url: 'https://www.blankcheckpod.com',
            description: 'Directors\' filmographies, one miniseries at a time — every film covered in order, early hits and blank checks alike. The ideal companion for a franchise binge.'
          },
          {
            name: 'You Must Remember This',
            kind: 'podcast',
            url: 'https://www.youmustrememberthispodcast.com',
            description: 'Karina Longworth\'s meticulously researched secret histories of Hollywood\'s first century — the closest thing to an audiobook series about the movies.'
          },
          {
            name: 'Unspooled',
            kind: 'podcast',
            url: 'https://www.unspooledpodcast.com',
            description: 'Paul Scheer and Amy Nicholson work through the most essential films ever made — a watchlist and a film education in one feed.'
          },
          {
            name: 'The Rewatchables',
            kind: 'podcast',
            url: 'https://www.theringer.com/the-rewatchables',
            description: 'Bill Simmons and rotating Ringer guests revisit the movies everyone has seen a dozen times — best listened to right after your own rewatch.'
          },
          {
            name: 'How Did This Get Made?',
            kind: 'podcast',
            url: 'https://www.earwolf.com/show/how-did-this-get-made',
            description: 'Paul Scheer, June Diane Raphael and Jason Mantzoukas tear into gloriously bad movies. Watch the trainwreck first — it doubles the fun.'
          },
          {
            name: 'Scriptnotes',
            kind: 'podcast',
            url: 'https://scriptnotes.net',
            description: 'Screenwriters John August and Craig Mazin on the craft and business of writing for film — the industry-side view most shows skip.'
          },
          {
            name: 'The Next Picture Show',
            kind: 'podcast',
            url: 'https://nextpictureshow.net',
            description: 'Each episode pairs a classic with a new release that echoes it — two movies for your watchlist every week.'
          },
          {
            name: 'Maltin on Movies',
            kind: 'podcast',
            url: 'https://leonardmaltin.com',
            description: 'Critic Leonard Maltin and daughter Jessie talk film with actors, directors and fellow obsessives — warm, encyclopedic and unpretentious.'
          }
        ]
      }
    ]
  },
  'audiobook-adaptations': {
    type: 'editorial',
    title: 'Audiobooks Worth Hearing Before the Movie',
    tagline: 'Great narration adds a layer the screen can\'t — these adaptations reward listening first.',
    group: 'guides',
    relatedParams: {
      with_keywords: '818', // based on novel or book
      'vote_average.gte': 7,
      'vote_count.gte': 300,
      sort_by: 'popularity.desc'
    },
    relatedHeading: 'More acclaimed movies based on books',
    sections: [
      {
        paragraphs: [
          'A good audiobook is a performance, not just a reading — full casts, unreliable narrators and voices that stay with you long after the adaptation\'s credits roll. Start with the recording, then stream the film to see what the director kept, changed or cut entirely.'
        ]
      },
      {
        heading: 'Listen first, stream second',
        items: [
          {
            name: 'The Martian — Andy Weir',
            kind: 'book',
            path: '/movies/286217',
            pathLabel: 'Stream the adaptation',
            description: 'R.C. Bray\'s narration of the original recording turns Watney\'s logs into a one-man show — the sarcasm and survival math hit harder aloud.'
          },
          {
            name: 'World War Z — Max Brooks',
            kind: 'book',
            path: '/movies/72190',
            pathLabel: 'Stream the adaptation',
            description: 'The full-cast recording — Alan Alda, Mark Hamill and more — turns the oral-history structure into a documentary about a fictional war. The movie goes its own way, which makes hearing this first even better.'
          },
          {
            name: 'Dune — Frank Herbert',
            kind: 'book',
            path: '/movies/438631',
            pathLabel: 'Stream the adaptation',
            description: 'Herbert\'s dense world-building is easier to absorb by ear, and knowing who everyone is makes Villeneuve\'s adaptation land as spectacle instead of homework.'
          },
          {
            name: 'Gone Girl — Gillian Flynn',
            kind: 'book',
            path: '/movies/210577',
            pathLabel: 'Stream the adaptation',
            description: 'Dual narrators Julia Whelan and Kirby Heyborne play Amy and Nick off each other — the midpoint twist lands differently once you\'ve lived inside both voices.'
          },
          {
            name: 'Ready Player One — Ernest Cline',
            kind: 'book',
            path: '/movies/333339',
            pathLabel: 'Stream the adaptation',
            description: 'Wil Wheaton narrates like he\'s reading his own fan letter to the \'80s — an enthusiasm Spielberg\'s film largely trades for spectacle.'
          },
          {
            name: 'Jurassic Park — Michael Crichton',
            kind: 'book',
            path: '/movies/329',
            pathLabel: 'Stream the adaptation',
            description: 'The novel\'s chaos-theory warnings and darker park failures explain choices the film only implies — plus set pieces that never made it to the screen.'
          },
          {
            name: 'The Shining — Stephen King',
            kind: 'book',
            path: '/movies/694',
            pathLabel: 'Stream the adaptation',
            description: 'King\'s Jack Torrance is a tragedy Kubrick deliberately flattened into a nightmare — Campbell Scott\'s narration makes the descent feel personal.'
          },
          {
            name: 'Fight Club — Chuck Palahniuk',
            kind: 'book',
            path: '/movies/550',
            pathLabel: 'Stream the adaptation',
            description: 'Hearing the narrator\'s voice in your head makes the reveal feel inevitable in hindsight — and the book\'s ending is a different animal entirely.'
          },
          {
            name: 'No Country for Old Men — Cormac McCarthy',
            kind: 'book',
            path: '/movies/6977',
            pathLabel: 'Stream the adaptation',
            description: 'McCarthy\'s spare prose and Sheriff Bell\'s monologues are nearly a radio play already — the Coens filmed it almost word for word, so compare them directly.'
          },
          {
            name: 'The Princess Bride — William Goldman',
            kind: 'book',
            path: '/movies/2493',
            pathLabel: 'Stream the adaptation',
            description: 'Goldman\'s "abridgement" framing device — an author annotating a book he claims he didn\'t write — is a joke the film can only hint at, and the asides are half the fun.'
          },
          {
            name: 'Oil! — Upton Sinclair',
            kind: 'book',
            path: '/movies/7345',
            pathLabel: 'Stream the adaptation',
            description: 'Paul Thomas Anderson borrowed the oilfields and the father-son antagonism, then wrote a different story — the source novel behind There Will Be Blood is the surprise prequel nobody expects.'
          },
          {
            name: 'Do Androids Dream of Electric Sheep? — Philip K. Dick',
            kind: 'book',
            path: '/movies/78',
            pathLabel: 'Stream the adaptation',
            description: 'Blade Runner kept the replicants and dropped the empathy religion and the titular sheep — the book is stranger and sadder than the film.'
          },
          {
            name: 'The Silence of the Lambs — Thomas Harris',
            kind: 'book',
            path: '/movies/274',
            pathLabel: 'Stream the adaptation',
            description: 'Frank Muller\'s widely praised recording voices Lecter with unnerving calm — a masterclass in narration from one of the form\'s best.'
          },
          {
            name: 'American Psycho — Bret Easton Ellis',
            kind: 'book',
            path: '/movies/1359',
            pathLabel: 'Stream the adaptation',
            description: 'Far more disturbing and far funnier than the film — hearing Bateman\'s deadpan cataloguing read aloud is genuinely surreal.'
          }
        ]
      }
    ]
  },
  'awards-on-streaming': {
    type: 'editorial',
    title: 'Best Picture Winners Streaming Now',
    tagline: 'Every Academy Award Best Picture winner you can stream tonight, and where to find it.',
    group: 'guides',
    relatedParams: {
      'vote_average.gte': 7.5,
      'vote_count.gte': 1000,
      'primary_release_date.gte': '2020-01-01',
      sort_by: 'popularity.desc'
    },
    relatedHeading: 'More recent acclaimed movies',
    sections: [
      {
        paragraphs: [
          'Awards season is the easiest time to catch up on the canon — Best Picture winners bounce between services constantly, so each entry links to a live "where to watch" page instead of a provider name that might be stale next month. Availability tracked daily across the major US services.'
        ]
      },
      {
        heading: 'The winners, most recent first',
        items: [
          {
            name: 'Anora (2024)',
            path: '/movies/1064213',
            pathLabel: 'Where to stream',
            description: 'Sean Baker\'s screwball-tragedy about a Brooklyn dancer who marries into Russian money — a rare indie sweep that took Picture, Director, Actress, Editing and Screenplay.'
          },
          {
            name: 'Oppenheimer (2023)',
            path: '/movies/872585',
            pathLabel: 'Where to stream',
            description: 'Christopher Nolan\'s three-hour biopic that somehow played like a blockbuster — seven Oscars including Picture and Director.'
          },
          {
            name: 'Everything Everywhere All at Once (2022)',
            path: '/movies/545611',
            pathLabel: 'Where to stream',
            description: 'The multiverse laundromat epic that won seven awards and made A24 the first studio to sweep every above-the-line category in one night.'
          },
          {
            name: 'CODA (2021)',
            path: '/movies/776503',
            pathLabel: 'Where to stream',
            description: 'The Sundance drama about a hearing child of deaf parents — the first streaming-first film to take the top prize.'
          },
          {
            name: 'Nomadland (2020)',
            path: '/movies/581734',
            pathLabel: 'Where to stream',
            description: 'Chloé Zhao\'s van-dwelling portrait of gig-economy America, shot with real nomads alongside Frances McDormand.'
          },
          {
            name: 'Parasite (2019)',
            path: '/movies/496243',
            pathLabel: 'Where to stream',
            description: 'Bong Joon-ho\'s class-war thriller — the first non-English-language film ever to win Best Picture, and still the reference point for the category.'
          },
          {
            name: 'Green Book (2018)',
            path: '/movies/490132',
            pathLabel: 'Where to stream',
            description: 'The crowd-pleasing road movie about Dr. Don Shirley\'s tour through the Jim Crow South — divisive win, undeniable watchability.'
          },
          {
            name: 'The Shape of Water (2017)',
            path: '/movies/399055',
            pathLabel: 'Where to stream',
            description: 'Guillermo del Toro\'s Cold War fairy tale — the first creature romance to take Best Picture, and the most del Toro film possible.'
          },
          {
            name: 'Moonlight (2016)',
            path: '/movies/376867',
            pathLabel: 'Where to stream',
            description: 'Barry Jenkins\' three-act portrait of a life — the envelope mix-up made history, the film deserved it on merit alone.'
          },
          {
            name: 'Spotlight (2015)',
            path: '/movies/314365',
            pathLabel: 'Where to stream',
            description: 'The Boston Globe\'s church-abuse investigation rendered as a procedural — the rare journalism movie with zero wasted scenes.'
          },
          {
            name: 'Birdman (2014)',
            path: '/movies/194662',
            pathLabel: 'Where to stream',
            description: 'Iñárritu\'s single-take showbiz panic attack — Michael Keaton\'s comeback role about a superhero actor chasing legitimacy.'
          },
          {
            name: '12 Years a Slave (2013)',
            path: '/movies/76203',
            pathLabel: 'Where to stream',
            description: 'Steve McQueen\'s unflinching Solomon Northup adaptation — the first film by a Black director to win Best Picture.'
          },
          {
            name: 'The Hurt Locker (2009)',
            path: '/movies/12162',
            pathLabel: 'Where to stream',
            description: 'Kathryn Bigelow\'s bomb-squad procedural — beat Avatar for the top prize and made her the first woman to win Best Director.'
          },
          {
            name: 'Slumdog Millionaire (2008)',
            path: '/movies/12405',
            pathLabel: 'Where to stream',
            description: 'Danny Boyle\'s Mumbai quiz-show fairy tale — eight Oscars and the feel-good winner that still holds up.'
          },
          {
            name: 'No Country for Old Men (2007)',
            path: '/movies/6977',
            pathLabel: 'Where to stream',
            description: 'The Coens\' Cormac McCarthy adaptation — four awards, one cattle gun, and the most controlled thriller of the century.'
          },
          {
            name: 'The Departed (2006)',
            path: '/movies/1422',
            pathLabel: 'Where to stream',
            description: 'Scorsese\'s Boston moles-vs-moles remake — the win that finally got him the Picture and Director statues.'
          }
        ]
      },
      {
        paragraphs: [
          'Winners rotate between services monthly — if a favorite left your subscription, it will surface elsewhere. We track daily catalog changes across the major US services, so each detail page shows the current answer.'
        ]
      }
    ]
  }
}

export function getCuratedList(slug: string): ListDef | null {
  return curatedLists[slug] || null
}
