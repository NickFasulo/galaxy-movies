export default async function handler(req, res) {
  const { movieId } = req.query

  if (!movieId) {
    return res.status(400).json({ error: 'Movie ID is required' })
  }

  const movieDetailsUrl = `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}&language=en-US`
  const videosUrl = `https://api.themoviedb.org/3/movie/${movieId}/videos?api_key=${process.env.TMDB_API_KEY}&language=en-US`

  try {
    const movieResponse = await fetch(movieDetailsUrl)
    const movieData = await movieResponse.json()

    if (movieResponse.status !== 200) {
      return res.status(movieResponse.status).json(movieData)
    }

    const videosResponse = await fetch(videosUrl)
    const videosData = await videosResponse.json()

    if (videosResponse.status !== 200) {
      return res.status(videosResponse.status).json(videosData)
    }

    movieData.videos = videosData.results

    return res.status(200).json(movieData)
  } catch (error) {
    console.error('Error fetching movie details:', error)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}
