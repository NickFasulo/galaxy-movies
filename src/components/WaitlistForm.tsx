import { useState, type FormEvent } from 'react'
import { Box, Button, Flex, Input, Text } from '@chakra-ui/react'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setStatus('submitting')
    setError('')
    try {
      const resp = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      const body = await resp.json()
      setStatus(body.pending ? 'pending' : 'done')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('idle')
    }
  }

  return (
    <Box bg='blackAlpha.500' border='1px solid var(--chakra-colors-white-alpha-200)' borderRadius='0.5rem' p={4}>
      <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mb={1}>
        Streaming alerts
      </Text>
      {status === 'done' || status === 'pending' ? (
        <Text color='green.300' fontSize='sm'>
          {status === 'pending'
            ? 'Check your inbox — we sent a confirmation link to verify your email.'
            : "You're on the list. We'll email you when something on it lands on your services."}
        </Text>
      ) : (
        <>
          <Text color='gray.400' fontSize='sm' mb={3}>
            Leave your email and we&apos;ll alert you the moment a saved movie or show lands on one of your streaming services.
          </Text>
          <Flex gap={2} direction={{ base: 'column', md: 'row' }} asChild><form onSubmit={submit}>
              <Input
                type='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='you@example.com'
                size='sm'
                bg='blackAlpha.400'
                borderColor='whiteAlpha.300'
                color='white'
                _placeholder={{ color: 'gray.500' }}
              />
              <Button type='submit' size='sm' colorPalette='blue' loading={status === 'submitting'} flexShrink={0}>
                Notify me
              </Button>
            </form></Flex>
          {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
        </>
      )}
    </Box>
  );
}
