import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Badge, Box, Button, Flex, Input, List, Text } from '@chakra-ui/react'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import Backdrop, { BACKDROP_OVERLAYS } from '../components/Backdrop'
import WaitlistForm from '../components/WaitlistForm'
import { usePlusStatus } from '../hooks/usePlus'
import { firstParam } from '../utils/query'

const FEATURES = [
  'Alerts for new arrivals on your services, matched to what you rate highly',
  'Leaving-soon warnings when something on your list is about to disappear',
  'Galaxy Bot goes from 10 to 100 messages an hour',
  'Export your whole list and ratings as JSON anytime',
  'List, ratings, and services synced across every device you link'
]

export default function Plus() {
  const { query } = useRouter()
  const { loading, creds, plus } = usePlusStatus()
  const [busy, setBusy] = useState<'monthly' | 'yearly' | null>(null)
  const [error, setError] = useState('')
  const success = firstParam(query.status) === 'success'

  const checkout = async (plan: 'monthly' | 'yearly') => {
    if (!creds) return
    setBusy(plan)
    setError('')
    try {
      const resp = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: creds.email, key: creds.key, plan })
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.ok && data.url) {
        window.location.href = data.url
        return
      }
      setError(data.error || 'Could not start checkout. Please try again.')
    } catch {
      setError('Could not start checkout. Please try again.')
    }
    setBusy(null)
  }

  return (
    <>
      <PageHead
        title='Galaxy Plus'
        description='Streaming alerts matched to your taste, leaving-soon warnings, and more Galaxy Bot for a few dollars a month.'
        noindex
      />
      <Backdrop
        path={null}
        fallback='plus'
        priority
        overlays={BACKDROP_OVERLAYS.topBand}
        imagePosition='center 30%'
        bottom='auto'
        h={{ base: '22rem', md: '34rem' }}
      />
      <Box position='relative' flex='1' display='flex' flexDirection='column'>
        <PageShell
          title='Galaxy Plus'
          description='The free tier already syncs your list and ratings across devices. Plus makes your taste profile work harder.'
          withBackButton
        >
        {success && (
          <Box mt={6} bg='green.900' border='1px solid var(--chakra-colors-green-700)' borderRadius='lg' p={4} maxW='36rem'>
            <Text color='green.200' fontSize='sm'>
              You&apos;re in! Plus activates as soon as the payment clears, usually within seconds.
            </Text>
          </Box>
        )}

        <List.Root as='ul' mt={8} pl={4} gap={2} maxW='36rem' color='gray.200' fontSize='sm'>
          {FEATURES.map((feature) => <List.Item key={feature}>{feature}</List.Item>)}
        </List.Root>

        <Box mt={8}>
          {loading ? null : plus ? (
            <Box bg='blackAlpha.500' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4} maxW='36rem'>
              <Flex align='center' gap={2} mb={1}>
                <Badge colorPalette='yellow'>Plus</Badge>
                <Text color='white' fontWeight='bold' fontSize='sm'>Galaxy Plus is active</Text>
              </Flex>
              <Text color='gray.400' fontSize='sm'>
                Thanks for supporting the site.{' '}
                <a
                  href={`/api/billing/portal?email=${encodeURIComponent(creds!.email)}&key=${encodeURIComponent(creds!.key)}`}
                  style={{ textDecoration: 'underline' }}
                >
                  Manage your subscription
                </a>
              </Text>
            </Box>
          ) : creds ? (
            <Flex gap={4} direction={{ base: 'column', md: 'row' }} maxW='36rem'>
              <Box flex={1} bg='blackAlpha.500' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4}>
                <Text color='white' fontWeight='bold'>Monthly</Text>
                <Text color='gray.400' fontSize='sm' mb={3}>$3 / month, cancel anytime</Text>
                <Button size='sm' variant='outline' color='white' borderColor='border.subtle' _hover={{ bg: 'surface.overlay' }}
                  loading={busy === 'monthly'} onClick={() => checkout('monthly')} w='100%'>
                  Go monthly
                </Button>
              </Box>
              <Box flex={1} bg='blackAlpha.500' border='1px solid var(--chakra-colors-yellow-700)' borderRadius='lg' p={4}>
                <Flex align='center' gap={2}>
                  <Text color='white' fontWeight='bold'>Yearly</Text>
                  <Badge colorPalette='yellow' fontSize='2xs'>Best value</Badge>
                </Flex>
                <Text color='gray.400' fontSize='sm' mb={3}>$20 / year, about $1.67 a month</Text>
                <Button size='sm' colorPalette='yellow' loading={busy === 'yearly'} onClick={() => checkout('yearly')} w='100%'>
                  Go yearly
                </Button>
              </Box>
            </Flex>
          ) : (
            <Box maxW='36rem'>
              <Text color='gray.400' fontSize='sm' mb={3}>
                Plus works through your email. No passwords, no account. Confirm yours and it becomes your login on every device.
              </Text>
              <WaitlistForm purpose='login' />
              <RecoverAccess />
            </Box>
          )}
          {error && <Text color='red.300' fontSize='sm' mt={3}>{error}</Text>}
          {!loading && !plus && creds && (
            <Text color='gray.500' fontSize='xs' mt={4}>
              Checkout is handled by Polar, the merchant of record, so taxes and receipts come from them.
            </Text>
          )}
        </Box>

        <Box mt={10} maxW='36rem'>
          <Text color='gray.500' fontSize='xs'>
            Not sure yet? The <Link href='/watchlist' style={{ textDecoration: 'underline' }}>list page</Link> keeps working free: sync, watchlist alerts, and the weekly digest aren&apos;t going anywhere.
          </Text>
        </Box>
        </PageShell>
      </Box>
    </>
  )
}

// Paid subscribers who lost their sync credential (e.g. unsubscribed, which
// clears it) restore access by email — keyed to the billing record, not the
// waitlist, so recovering never re-subscribes them to alerts.
function RecoverAccess() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const resp = await fetch('/api/billing/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || 'Something went wrong')
      }
      setState('sent')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setState('idle')
    }
  }

  if (!open) {
    return (
      <Text color='gray.500' fontSize='xs' mt={3}>
        Paid already?{' '}
        <button type='button' onClick={() => setOpen(true)} style={{ textDecoration: 'underline' }}>
          Email me my access link
        </button>
      </Text>
    )
  }

  if (state === 'sent') {
    return (
      <Text color='green.300' fontSize='sm' mt={3}>
        If that address has a subscription, a sign-in link is on its way.
      </Text>
    )
  }

  return (
    <Box mt={3}>
      <Flex gap={2} direction={{ base: 'column', md: 'row' }} asChild>
        <form onSubmit={submit}>
          <Input
            type='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            size='sm'
            bg='blackAlpha.400'
            borderColor='border.subtle'
            color='white'
            _placeholder={{ color: 'gray.500' }}
          />
          <Button type='submit' size='sm' colorPalette='blue' loading={state === 'sending'} flexShrink={0}>
            Send link
          </Button>
        </form>
      </Flex>
      {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
    </Box>
  )
}
