import { useState } from 'react'
import { Box, Button, Flex, Input, Text } from '@chakra-ui/react'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  const submit = async (e) => {
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
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  return (
    <Box bg='blackAlpha.500' border='1px solid' borderColor='whiteAlpha.200' borderRadius='1rem' p={4}>
      <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' mb={1}>
        Streaming alerts — coming soon
      </Text>
      {status === 'done' ? (
        <Text color='green.300' fontSize='sm'>
          You're on the list. We'll email you when alerts launch.
        </Text>
      ) : (
        <>
          <Text color='gray.400' fontSize='sm' mb={3}>
            Leave your email and we'll let you know when we can alert you the moment a saved movie lands on your services.
          </Text>
          <Flex as='form' onSubmit={submit} gap={2} direction={{ base: 'column', md: 'row' }}>
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
            <Button type='submit' size='sm' colorScheme='blue' isLoading={status === 'submitting'} flexShrink={0}>
              Notify me
            </Button>
          </Flex>
          {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
        </>
      )}
    </Box>
  )
}
