export interface TopicSeed {
  slug: string
  keyword: string
  type: 'similar' | 'discover'
  media?: 'tv'
  movieTitle?: string
  showTitle?: string
  hint?: string
}

// Keyword-informed backlog for the content pipeline. Volumes/KD from OpenSEO
// research (US, Oct 2026). `similar` seeds resolve movieTitle via TMDB search and
// power "Movies Like X" pages off /movie/{id}/recommendations. `discover` seeds
// hand the keyword + hint to the generator, which drafts TMDB discover params.
export const topicSeeds: TopicSeed[] = [
  { slug: 'movies-like-interstellar', keyword: 'movies like interstellar', type: 'similar', movieTitle: 'Interstellar' },
  { slug: 'movies-like-the-notebook', keyword: 'movies like the notebook', type: 'similar', movieTitle: 'The Notebook' },
  { slug: 'movies-like-the-hunger-games', keyword: 'movies like the hunger games', type: 'similar', movieTitle: 'The Hunger Games' },
  { slug: 'movies-like-superbad', keyword: 'movies like superbad', type: 'similar', movieTitle: 'Superbad' },
  { slug: 'movies-like-shutter-island', keyword: 'movies like shutter island', type: 'similar', movieTitle: 'Shutter Island' },
  { slug: 'movies-like-knives-out', keyword: 'movies like knives out', type: 'similar', movieTitle: 'Knives Out' },
  { slug: 'movies-like-coraline', keyword: 'movies like coraline', type: 'similar', movieTitle: 'Coraline' },
  { slug: 'movies-like-maze-runner', keyword: 'movies like maze runner', type: 'similar', movieTitle: 'The Maze Runner' },
  { slug: 'movies-like-good-will-hunting', keyword: 'movies like good will hunting', type: 'similar', movieTitle: 'Good Will Hunting' },
  { slug: 'movies-like-10-things-i-hate-about-you', keyword: 'movies like 10 things i hate about you', type: 'similar', movieTitle: '10 Things I Hate About You' },
  { slug: 'movies-like-white-chicks', keyword: 'movies like white chicks', type: 'similar', movieTitle: 'White Chicks' },
  { slug: 'movies-like-the-hangover', keyword: 'movies like the hangover', type: 'similar', movieTitle: 'The Hangover' },
  { slug: 'movies-like-inception', keyword: 'movies like inception', type: 'similar', movieTitle: 'Inception' },
  { slug: 'movies-like-harry-potter', keyword: 'movies like harry potter', type: 'similar', movieTitle: "Harry Potter and the Philosopher's Stone" },
  { slug: 'movies-like-the-devil-wears-prada', keyword: 'movies like the devil wears prada', type: 'similar', movieTitle: 'The Devil Wears Prada' },
  { slug: 'movies-like-get-out', keyword: 'movies like get out', type: 'similar', movieTitle: 'Get Out' },
  { slug: 'movies-like-the-conjuring', keyword: 'movies like the conjuring', type: 'similar', movieTitle: 'The Conjuring' },
  { slug: 'movies-like-twilight', keyword: 'movies like twilight', type: 'similar', movieTitle: 'Twilight' },
  { slug: 'movies-like-pride-and-prejudice', keyword: 'movies like pride and prejudice', type: 'similar', movieTitle: 'Pride & Prejudice' },
  { slug: 'movies-like-legally-blonde', keyword: 'movies like legally blonde', type: 'similar', movieTitle: 'Legally Blonde' },
  { slug: 'movies-like-fight-club', keyword: 'movies like fight club', type: 'similar', movieTitle: 'Fight Club' },
  { slug: 'movies-like-john-wick', keyword: 'movies like john wick', type: 'similar', movieTitle: 'John Wick' },
  { slug: 'movies-like-national-treasure', keyword: 'movies like national treasure', type: 'similar', movieTitle: 'National Treasure' },
  { slug: 'movies-like-midsommar', keyword: 'movies like midsommar', type: 'similar', movieTitle: 'Midsommar' },
  { slug: 'movies-like-scream', keyword: 'movies like scream', type: 'similar', movieTitle: 'Scream' },
  { slug: 'movies-like-prisoners', keyword: 'movies like prisoners', type: 'similar', movieTitle: 'Prisoners' },
  { slug: 'movies-like-se7en', keyword: 'movies like se7en', type: 'similar', movieTitle: 'Se7en' },
  { slug: 'movies-like-jumanji', keyword: 'movies like jumanji', type: 'similar', movieTitle: 'Jumanji: Welcome to the Jungle' },
  { slug: 'movies-like-donnie-darko', keyword: 'movies like donnie darko', type: 'similar', movieTitle: 'Donnie Darko' },
  { slug: 'movies-like-hereditary', keyword: 'movies like hereditary', type: 'similar', movieTitle: 'Hereditary' },
  { slug: 'movies-like-the-matrix', keyword: 'movies like the matrix', type: 'similar', movieTitle: 'The Matrix' },
  { slug: 'movies-like-gladiator', keyword: 'movies like gladiator', type: 'similar', movieTitle: 'Gladiator' },
  { slug: 'movies-like-sicario', keyword: 'movies like sicario', type: 'similar', movieTitle: 'Sicario' },
  { slug: 'movies-like-the-goonies', keyword: 'movies like the goonies', type: 'similar', movieTitle: 'The Goonies' },

  { slug: 'underrated-horror-movies', keyword: 'underrated horror movies', type: 'discover', hint: 'Well-reviewed horror films most people missed — high vote average, moderate-to-low vote counts.' },
  { slug: 'underrated-comedy-movies', keyword: 'underrated comedy movies', type: 'discover', hint: 'Well-reviewed comedies that flew under the radar — high vote average, moderate-to-low vote counts.' },
  { slug: 'underrated-sci-fi-movies', keyword: 'underrated sci fi movies', type: 'discover', hint: 'Well-reviewed science fiction films that never got a wide audience — high vote average, moderate-to-low vote counts.' },
  { slug: 'underrated-thriller-movies', keyword: 'underrated thriller movies', type: 'discover', hint: 'Well-reviewed thrillers most people missed — high vote average, moderate-to-low vote counts.' },
  { slug: 'underrated-80s-movies', keyword: 'underrated 80s movies', type: 'discover', hint: 'Well-reviewed 1980s films most people missed — released 1980-1989, high vote average, moderate vote counts.' },
  { slug: 'underrated-2000s-movies', keyword: 'underrated 2000s movies', type: 'discover', hint: 'Well-reviewed 2000s films that flew under the radar — released 2000-2009, high vote average, moderate vote counts.' },
  { slug: 'feel-good-comedy-movies', keyword: 'feel good comedy movies', type: 'discover', hint: 'Uplifting comedies — light, warm, rewatchable.' },
  { slug: 'romantic-movies-to-watch', keyword: 'romantic movies to watch', type: 'discover', hint: 'Great romance films — crowd-pleasing and well-reviewed.' },
  { slug: 'movies-to-watch-high', keyword: 'movies to watch high', type: 'discover', hint: 'Visually trippy or absurdly funny films — stoner-comedy keywords, surreal animated or psychedelic picks.' },
  { slug: 'scary-movies-to-watch', keyword: 'scary movies to watch', type: 'discover', hint: 'The scariest well-regarded horror films — horror genre with strong ratings.' },
  { slug: 'classic-movies-to-watch', keyword: 'classic movies to watch', type: 'discover', hint: 'Essential pre-1990 classics that still hold up — high vote average, high vote counts.' },
  { slug: 'mind-bending-horror-movies', keyword: 'mind bending horror movies', type: 'discover', hint: 'Horror films with psychological or reality-twisting angles — psychological-horror / surreal keywords where possible.' },

  // media: 'tv' seeds run the same pipeline against /discover/tv and
  // /tv/{id}/recommendations — TMDB tv genre ids differ from movie ids.
  { slug: 'shows-like-breaking-bad', keyword: 'shows like breaking bad', type: 'similar', media: 'tv', showTitle: 'Breaking Bad' },
  { slug: 'shows-like-game-of-thrones', keyword: 'shows like game of thrones', type: 'similar', media: 'tv', showTitle: 'Game of Thrones' },
  { slug: 'shows-like-the-office', keyword: 'shows like the office', type: 'similar', media: 'tv', showTitle: 'The Office' },
  { slug: 'shows-like-stranger-things', keyword: 'shows like stranger things', type: 'similar', media: 'tv', showTitle: 'Stranger Things' },
  { slug: 'shows-like-succession', keyword: 'shows like succession', type: 'similar', media: 'tv', showTitle: 'Succession' },
  { slug: 'shows-like-true-detective', keyword: 'shows like true detective', type: 'similar', media: 'tv', showTitle: 'True Detective' },
  { slug: 'shows-like-fleabag', keyword: 'shows like fleabag', type: 'similar', media: 'tv', showTitle: 'Fleabag' },
  { slug: 'shows-like-the-bear', keyword: 'shows like the bear', type: 'similar', media: 'tv', showTitle: 'The Bear' },
  { slug: 'shows-like-dark', keyword: 'shows like dark', type: 'similar', media: 'tv', showTitle: 'Dark' },
  { slug: 'shows-like-severance', keyword: 'shows like severance', type: 'similar', media: 'tv', showTitle: 'Severance' },
  { slug: 'shows-like-better-call-saul', keyword: 'shows like better call saul', type: 'similar', media: 'tv', showTitle: 'Better Call Saul' },
  { slug: 'shows-like-black-mirror', keyword: 'shows like black mirror', type: 'similar', media: 'tv', showTitle: 'Black Mirror' },
  { slug: 'shows-like-the-boys', keyword: 'shows like the boys', type: 'similar', media: 'tv', showTitle: 'The Boys' },
  { slug: 'shows-like-the-last-of-us', keyword: 'shows like the last of us', type: 'similar', media: 'tv', showTitle: 'The Last of Us' },
  { slug: 'shows-like-wednesday', keyword: 'shows like wednesday', type: 'similar', media: 'tv', showTitle: 'Wednesday' },
  { slug: 'shows-like-squid-game', keyword: 'shows like squid game', type: 'similar', media: 'tv', showTitle: 'Squid Game' },
  { slug: 'shows-like-sherlock', keyword: 'shows like sherlock', type: 'similar', media: 'tv', showTitle: 'Sherlock' },
  { slug: 'shows-like-ted-lasso', keyword: 'shows like ted lasso', type: 'similar', media: 'tv', showTitle: 'Ted Lasso' },
  { slug: 'shows-like-euphoria', keyword: 'shows like euphoria', type: 'similar', media: 'tv', showTitle: 'Euphoria' },
  { slug: 'shows-like-yellowstone', keyword: 'shows like yellowstone', type: 'similar', media: 'tv', showTitle: 'Yellowstone' },
  { slug: 'shows-like-the-mandalorian', keyword: 'shows like the mandalorian', type: 'similar', media: 'tv', showTitle: 'The Mandalorian' },
  { slug: 'shows-like-peaky-blinders', keyword: 'shows like peaky blinders', type: 'similar', media: 'tv', showTitle: 'Peaky Blinders' },
  { slug: 'shows-like-the-crown', keyword: 'shows like the crown', type: 'similar', media: 'tv', showTitle: 'The Crown' },
  { slug: 'shows-like-mindhunter', keyword: 'shows like mindhunter', type: 'similar', media: 'tv', showTitle: 'Mindhunter' },
  { slug: 'shows-like-the-witcher', keyword: 'shows like the witcher', type: 'similar', media: 'tv', showTitle: 'The Witcher' },
  { slug: 'shows-like-house-of-the-dragon', keyword: 'shows like house of the dragon', type: 'similar', media: 'tv', showTitle: 'House of the Dragon' },

  { slug: 'underrated-tv-shows', keyword: 'underrated tv shows', type: 'discover', media: 'tv', hint: 'Well-reviewed series most people missed — high vote average, moderate-to-low vote counts.' },
  { slug: 'binge-worthy-tv-shows', keyword: 'binge worthy tv shows', type: 'discover', media: 'tv', hint: 'Addictive multi-season series — high popularity and strong ratings.' },
  { slug: 'best-miniseries', keyword: 'best miniseries', type: 'discover', media: 'tv', hint: 'Top-rated limited series — with_type 2 (Miniseries), high vote average.' },
  { slug: 'feel-good-tv-shows', keyword: 'feel good tv shows', type: 'discover', media: 'tv', hint: 'Warm, uplifting comedies and light dramas — crowd-pleasing and well-reviewed.' },
  { slug: 'crime-shows-to-watch', keyword: 'crime shows to watch', type: 'discover', media: 'tv', hint: 'Acclaimed crime dramas and procedurals — crime genre with strong ratings.' },
  { slug: 'british-tv-shows-to-watch', keyword: 'british tv shows to watch', type: 'discover', media: 'tv', hint: 'Well-regarded UK series — with_origin_country GB, high vote average.' }
]
