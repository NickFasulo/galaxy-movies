import OpenAI from 'openai'
const openai = new OpenAI()

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { modalData } = req.body

    try {
      const review = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful assistant that writes movie reviews in a professional tone.'
          },
          {
            role: 'user',
            content: `Write a review for the ${modalData.genres[0].name} ${modalData.genres[1].name} movie "${modalData.title}" in one paragraph based on this overview: ${modalData.overview}.`
          }
        ]
      })

      res.status(200).json({ review: review.choices[0].message.content })
    } catch (error) {
      console.error('Error generating review:', error)
      res.status(500).json({ error: 'Failed to generate review' })
    }
  } else {
    res.setHeader('Allow', ['POST'])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
