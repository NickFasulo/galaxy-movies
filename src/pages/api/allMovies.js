import * as tf from '@tensorflow/tfjs'
import * as nsfwjs from 'nsfwjs'
import sharp from 'sharp'

let modelPromise = null

async function getNSFWModel() {
  if (!modelPromise) {
    tf.enableProdMode()
    modelPromise = nsfwjs.load('MobileNetV2')
  }
  return modelPromise
}

async function isExplicitPoster(posterPath) {
  if (!posterPath) return true

  try {
    const model = await getNSFWModel()
    const imageUrl = `https://image.tmdb.org/t/p/w185${posterPath}`

    const response = await fetch(imageUrl)
    if (!response.ok) return false

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data, info } = await sharp(buffer)
      .resize(224, 224, { fit: 'cover' })
      .toFormat('raw')
      .toBuffer({ resolveWithObject: true })

    const imageTensor = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3])
    
    const predictions = await model.classify(imageTensor)
    imageTensor.dispose()

    const scores = {}
    predictions.forEach(p => {
      scores[p.className] = p.probability
    })

    if (scores.Porn > 0.35 || scores.Hentai > 0.35 || scores.Sexy > 0.70) {
      return true
    }

    return false
  } catch (error) {
    return false
  }
}

export default async function handler(req, res) {
  const { category = 'popular', page = 1, search = '' } = req.query
  const apiKey = process.env.TMDB_API_KEY

  if (!apiKey) {
    return res.status(500).json({ message: 'TMDB API key is missing' })
  }

  const strictKeywords = [
    'togefilm', 'toge', 'hotshots', 'ullu', 'altbalaji', 'kooku', 
    'primeplay', 'fliz', 'cineprime', 'porn', 'pornography', 
    'softcore', 'hentai', 'sexploitation'
  ]

  const contextualKeywords = [
    'erotic', 'erotica', 'explicit', 'pervert', 'perverted', 
    'horny', 'fuck', 'fucking', 'busty', 'uncut', 'stripper', 'topless', 
    'voyeur', 'seduction', 'infidelity', 'adultery', 'threesome', 'fetish', 
    'hooker', 'pimp', 'prostitute', 'brothel', 'escort', 'whore', 'slut'
  ]

  const strictRegex = new RegExp(`\\b(${strictKeywords.join('|')})\\b`, 'i')
  const contextualRegex = new RegExp(`\\b(${contextualKeywords.join('|')})\\b`, 'i')

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
  const popularCutoffDate = `${currentYear - 3}-01-01`

  try {
    const pageNum = parseInt(page, 10)
    let endpoint = ''

    if (search.trim().length > 0) {
      endpoint = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(search)}&page=${pageNum}&include_adult=false`
    } else if (category === 'upcoming') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&primary_release_date.gte=${todayStr}&sort_by=popularity.desc`
    } else if (category === 'popular') {
      endpoint = `https://api.themoviedb.org/3/discover/movie?api_key=${apiKey}&page=${pageNum}&include_adult=false&sort_by=popularity.desc&primary_release_date.gte=${popularCutoffDate}`
    } else {
      endpoint = `https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${pageNum}&include_adult=false`
    }

    const response = await fetch(endpoint)
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.status_message || 'Failed to fetch data from TMDB')
    }

    const rawMovies = data.results || []
    const candidates = []
    const moviesNeedingVisionCheck = new Set()

    for (const movie of rawMovies) {
      if (movie.adult) continue
      if (!movie.poster_path || !movie.overview || movie.overview.trim() === '') continue
      if (movie.vote_count < minVotes) continue

      if (!search.trim() && category === 'now_playing' && movie.release_date) {
        const releaseYear = new Date(movie.release_date).getFullYear()
        if (currentYear - releaseYear > 1) continue
      }

      const title = movie.title || ''
      const overview = movie.overview || ''
      const tagline = movie.tagline || ''
      const fullText = `${title} ${overview} ${tagline}`

      if (strictRegex.test(fullText)) continue

      if (contextualRegex.test(fullText)) {
        moviesNeedingVisionCheck.add(movie.id)
      }

      candidates.push(movie)
    }

    const nsfwChecks = await Promise.all(
      candidates.map(movie => {
        const isFlagged = moviesNeedingVisionCheck.has(movie.id)
        if (isFlagged || search.trim().length > 0) {
          return isExplicitPoster(movie.poster_path)
        }
        return false
      })
    )

    const filteredMovies = candidates.filter((_, index) => !nsfwChecks[index])

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')

    res.status(200).json({
      ...data,
      results: filteredMovies
    })
  } catch (error) {
    res.status(500).json({ message: error.message || 'Internal Server Error' })
  }
}