export default async function handler(req, res) {
  const { category, page } = req.query

  const apiKey = process.env.TMDB_API_KEY

  const filterMovies = movies => {
    const inappropriateKeywords = [
      'porn',
      'pornography',
      'intercourse',
      'erotic',
      'sex',
      'intimacy',
      'sexual',
      'explicit',
      'pervert',
      'perverted',
      'horny',
      'fuck',
      'arouse',
      'sensual',
      'desire',
      'busty',
      'TOGEFILM'
    ]

    return movies.filter(movie => {
      const containsInappropriateContent = inappropriateKeywords.some(
        keyword =>
          movie.title.toLowerCase().includes(keyword) ||
          movie.overview.toLowerCase().includes(keyword)
      )

      return !containsInappropriateContent && movie.adult === false
    })
  }

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${page}`
    )
    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.status_message || 'Failed to fetch data')
    }

    const uniqueMovies = Array.from(
      new Map(data.results.map(movie => [movie.id, movie])).values()
    )

    const filteredMovies = filterMovies(uniqueMovies)

    res.status(200).json({ ...data, results: filteredMovies })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}
