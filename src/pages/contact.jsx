import { useState } from 'react'
import { Box } from '@chakra-ui/react'
import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'

export default function Contact() {
  const [result, setResult] = useState('')
  const [status, setStatus] = useState('idle')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('submitting')
    setResult('Sending...')

    const formData = new FormData(e.target)
    formData.append('access_key', '855bed76-0220-41ab-b474-c3fb18d99933')

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.success) {
        setStatus('success')
        setResult('Thank you! Your message has been sent.')
        e.target.reset()
      } else {
        setStatus('error')
        setResult(data.message || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      setStatus('error')
      setResult('Failed to send message. Please check your connection.')
    }
  }

  return (
    <InfoPage
      title='Contact Galaxy Movies'
      description='Contact Galaxy Movies about corrections, feedback, or business inquiries.'
    >
      <InfoParagraph>
        For corrections, accessibility feedback, or partnership inquiries, use the form below to get in touch.
      </InfoParagraph>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
        <div>
          <label htmlFor="name" style={{ display: 'block', marginBottom: '0.25rem' }}>Name</label>
          <input
            type="text"
            id="name"
            name="name"
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #3a424a', backgroundColor: '#1f252b', color: '#fff' }}
          />
        </div>

        <div>
          <label htmlFor="email" style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
          <input
            type="email"
            id="email"
            name="email"
            required
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #3a424a', backgroundColor: '#1f252b', color: '#fff' }}
          />
        </div>

        <div>
          <label htmlFor="subject" style={{ display: 'block', marginBottom: '0.25rem' }}>Subject / Movie Title</label>
          <input
            type="text"
            id="subject"
            name="subject"
            placeholder="e.g., Inaccurate streaming info"
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #3a424a', backgroundColor: '#1f252b', color: '#fff' }}
          />
        </div>

        <div>
          <label htmlFor="message" style={{ display: 'block', marginBottom: '0.25rem' }}>Message</label>
          <textarea
            id="message"
            name="message"
            rows={5}
            required
            placeholder="Please include movie title and page URL if reporting inaccurate information."
            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #3a424a', backgroundColor: '#1f252b', color: '#fff' }}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'submitting'}
          style={{
            padding: '0.75rem',
            borderRadius: '4px',
            backgroundColor: status === 'submitting' ? '#2a3138' : '#1f252b',
            color: '#fff',
            border: '1px solid #3a424a',
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer'
          }}
        >
          {status === 'submitting' ? 'Sending...' : 'Send Message'}
        </button>

        {result && (
          <p style={{ marginTop: '0.5rem', color: status === 'error' ? '#fc8181' : '#68d391' }}>
            {result}
          </p>
        )}
      </form>

      <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
        <BackButton />
      </Box>
    </InfoPage>
  )
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}