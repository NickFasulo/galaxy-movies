import { useState, type FormEvent } from 'react'
import { Button, Flex, Text } from '@chakra-ui/react'
import DarkInput from '../../../components/DarkInput'
import Panel from '../../../components/Panel'
import { setAlertsCredentials } from '../alertsSync'
import { trackEvent } from '../../../lib/umami'

export default function WaitlistForm({ purpose = 'alerts', onConfirmed }: { purpose?: 'alerts' | 'login'; onConfirmed?: () => void }) {
  const login = purpose === 'login'
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
        body: JSON.stringify({ email, purpose })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      const body = await resp.json()
      // Dev/local fallback: no RESEND_API_KEY means the API confirms directly
      // and returns the sync key, so store it like a followed email link.
      if (body.devSyncKey) {
        setAlertsCredentials(email, body.devSyncKey)
        onConfirmed?.()
      }
      setStatus(body.pending ? 'pending' : 'done')
      trackEvent('waitlist-signup', { purpose, result: body.pending ? 'pending' : 'done' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('idle')
    }
  }

  return (
    <Panel title={login ? 'Confirm your email' : 'Streaming alerts'}>
      {status === 'done' || status === 'pending' ? (
        <Text color='green.300' fontSize='sm'>
          {status === 'pending'
            ? login
              ? 'Check your inbox — the link we sent drops you back here to pick a plan.'
              : 'Check your inbox — we sent a confirmation link to verify your email.'
            : login
              ? 'You\u2019re confirmed — pick a plan below.'
              : "You're on the list. We'll email you when something on it lands on your services."}
        </Text>
      ) : (
        <>
          <Text color='gray.400' fontSize='sm' mb={3}>
            {login
              ? 'We\u2019ll send one link to verify it. That address becomes your login on every device and where Polar sends receipts.'
              : 'Leave your email and we\u2019ll alert you the moment a saved movie or show lands on one of your streaming services. Confirming also syncs your list and ratings across devices.'}
          </Text>
          <Flex gap={2} direction={{ base: 'column', md: 'row' }} asChild><form onSubmit={submit}>
              <DarkInput
                type='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder='you@example.com'
                size='sm'
                _placeholder={{ color: 'gray.500' }}
              />
              <Button type='submit' size='sm' colorPalette='blue' loading={status === 'submitting'} flexShrink={0}>
                {login ? 'Send my link' : 'Notify me'}
              </Button>
            </form></Flex>
          {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
        </>
      )}
    </Panel>
  );
}
