export default async function handler(req, res) {
  const { category = 'popular', page = 1, search = '' } = req.query
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const inappropriateKeywords = [
    'togefilm', 'toge', 'hotshots', 'ullu', 'altbalaji', 'kooku', 
    'primeplay', 'fliz', 'cineprime', 'porn', 'pornography', 'erotic', 
    'erotica', 'softcore', 'hentai', 'explicit', 'pervert', 'perverted', 
    'horny', 'fuck', 'fucking', 'busty', 'uncut', 'stripper', 'topless', 
    'voyeur', 'seduction', 'infidelity', 'adultery', 'threesome', 'fetish', 
    'hooker', 'pimp', 'prostitute', 'brothel', 'sexploitation', 'escort', 'whore', 'slut'
  ]

  const regex = new RegExp(`\\b(${inappropriateKeywords.join('|')})\\b`, 'i')

  const getMinVoteThreshold = cat => {
    switch (cat) {
      case 'popular': return 20
      case 'top_rated': return 50
      case 'now_playing': return 3
      case 'upcoming': return 0
      default: return 10
    }
  }

  const minVotes = search.trim().length > 0 ? 0 : getMinVoteThreshold(category)
  const now = new Date()
  const currentYear = now.getFullYear()
  const todayStr = now.toISOString().split('T')[0]

  const filterMovies = movies => {
    return movies.filter(movie => {
      if (movie.adult) return false
      if (!movie.poster_path || !movie.overview || movie.overview.trim() === '') return false
      if (movie.vote_count < minVotes) return false

      if (!search.trim() && category === 'now_playing' && movie.release_date) {
        const releaseYear = new Date(movie.release_date).getFullYear()
        if (currentYear - releaseYear > 1) return false
      }

      const title = movie.title || ''
      const overview = movie.overview || ''
      const tagline = movie.tagline || ''

      return !(regex.test(title) || regex.test(overview) || regex.test(tagline))
    })
  }

  try {
    const pageNum = parseInt(page, 10)
    let endpoint = ''

    if (search.trim().length > 0) {
      endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
    } else if (category === 'upcoming') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&primary_release_date.gte=${todayStr}&sort_by=popularity.desc`
    } else {
      endpoint = `https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${pageNum}&include_adult=false`
    }

    const response = await fetch(endpoint)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.status_message || 'Failed to fetch data from TMDB')
    }

    const filteredMovies = filterMovies(data.results || [])

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')

    res.status(200).json({
      ...data,
      results: filteredMovies
    })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Internal Server Error' })
  }
}