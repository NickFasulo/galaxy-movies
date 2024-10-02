export default async function handler(req, res) {
	const { category, page } = req.query

	const apiKey = process.env.TMDB_API_KEY

	try {
		const response = await fetch(
			`https://api.themoviedb.org/3/movie/${category}?api_key=${apiKey}&page=${page}`
		)
		const data = await response.json()

		if (!response.ok) {
			throw new Error(data.status_message || 'Failed to fetch data')
		}

		res.status(200).json(data)
	} catch (error) {
		res.status(500).json({ message: error.message })
	}
}
