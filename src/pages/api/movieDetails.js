export default async function handler(req, res) {
  const { movieId } = req.query

  try {
    const response = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?api_key=${process.env.TMDB_API_KEY}`
    )
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ message: 'Error fetching movie' })
    }
    const movieData = await response.json()
    res.status(200).json(movieData)
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error' })
  }
}
