import { Configuration, OpenAIApi } from 'openai'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { modalData } = req.body

    try {
      const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY
      })
      const openai = new OpenAIApi(configuration)

      const review = await openai.createCompletion({
        model: 'gpt-3.5-turbo-instruct',
        prompt: `Write a review for the ${modalData.genres[0].name} ${modalData.genres[1].name} movie "${modalData.title}" in one paragraph based on this overview: ${modalData.overview}.`,
        temperature: 0.7,
        max_tokens: 120
      })

      res.status(200).json({ review: review.data.choices[0].text + '.' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate review' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
