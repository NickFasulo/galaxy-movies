import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field, Flex, Input, Text, Textarea } from '@chakra-ui/react'
import InfoPage, { InfoParagraph } from '../components/InfoPage'

export default function Contact() {
  const [result, setResult] = useState('')
  const [status, setStatus] = useState('idle')

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setStatus('submitting')
    setResult('Sending...')

    const formData = new FormData(form)
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
        form.reset()
      } else {
        setStatus('error')
        setResult(data.message || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setResult('Failed to send message. Please check your connection.')
    }
  }

  const field = (label: string, control: ReactNode) => (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      {control}
    </Field.Root>
  )

  const inputProps = {
    bg: 'surface.raised',
    color: 'white',
    borderColor: 'border.subtle',
    _placeholder: { color: 'gray.400' }
  } as const

  return (
    <InfoPage
      title='Contact Galaxy Movies'
      description='Contact Galaxy Movies about corrections, feedback, or business inquiries.'
      withBackButton
    >
      <InfoParagraph>
        For corrections, accessibility feedback, or partnership inquiries, use the form below to get in touch.
      </InfoParagraph>

      <Flex asChild direction='column' gap={4} mt={6}>
        <form onSubmit={handleSubmit}>
          {field('Name', <Input type='text' name='name' required {...inputProps} />)}
          {field('Email', <Input type='email' name='email' required {...inputProps} />)}
          {field('Subject / Movie Title', <Input type='text' name='subject' placeholder='e.g., Inaccurate streaming info' {...inputProps} />)}

          <input type='checkbox' name='botcheck' tabIndex={-1} autoComplete='off' style={{ display: 'none' }} aria-hidden='true' />
          {field('Message', (
            <Textarea
              name='message'
              rows={5}
              required
              placeholder='Please include movie title and page URL if reporting inaccurate information.'
              {...inputProps}
            />
          ))}

          <Button
            type='submit'
            disabled={status === 'submitting'}
            colorPalette='blue'
            alignSelf='flex-start'
          >
            {status === 'submitting' ? 'Sending...' : 'Send Message'}
          </Button>

          {result && (
            <Text mt={2} color={status === 'error' ? 'red.300' : 'green.300'}>
              {result}
            </Text>
          )}
        </form>
      </Flex>
    </InfoPage>
  );
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}
