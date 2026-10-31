import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Badge, Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import {
  LuArrowLeftRight,
  LuBell,
  LuBot,
  LuCalendar,
  LuFileOutput,
  LuHourglass,
  LuImport,
  LuLayers,
  LuSend,
  LuShare2,
  LuSparkles,
  LuTv
} from 'react-icons/lu'
import DarkInput from '../components/DarkInput'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import Backdrop, { BACKDROP_OVERLAYS } from '../components/Backdrop'
import WaitlistForm from '../features/alerts/components/WaitlistForm'
import { startPlusCheckout } from '../features/billing/components/PlusUpsell'
import { usePlusStatus } from '../features/billing/hooks/usePlus'
import { setAlertsCredentials } from '../features/alerts/alertsSync'
import { firstParam } from '../lib/http'
import { trackEvent } from '../lib/umami'

const FEATURES = [
  { icon: LuBell, title: 'Taste-matched alerts', blurb: 'New arrivals on your services, matched to what you rate highly.' },
  { icon: LuHourglass, title: 'Leaving-soon warnings', blurb: 'A heads-up before something on your list disappears.' },
  { icon: LuTv, title: 'Next-episode alerts', blurb: 'Know when a show on your list is about to air.' },
  { icon: LuSend, title: 'Alerts anywhere', blurb: 'Email by default, or Telegram DMs and your own Discord channel.' },
  { icon: LuBot, title: '10× Galaxy Bot', blurb: '100 messages an hour: knows your taste, and your chat history follows you across devices.' },
  { icon: LuSparkles, title: 'Picked for you', blurb: 'A recommendations rail on your list page, seeded by your ratings.' },
  { icon: LuShare2, title: 'A shareable list', blurb: 'A public link for your watchlist and ratings you can send to friends.' },
  { icon: LuLayers, title: 'Bigger limits', blurb: '1,000 list entries and 2,500 ratings synced across every device you link.' },
  { icon: LuArrowLeftRight, title: 'Two-way Trakt sync', blurb: 'Push your list out, or pull your existing Trakt history in.' },
  { icon: LuImport, title: 'Letterboxd import', blurb: 'Watchlist and ratings carry over in seconds.' },
  { icon: LuFileOutput, title: 'Export anytime', blurb: 'JSON or Letterboxd-ready CSVs whenever you want them.' },
  { icon: LuCalendar, title: 'Calendar feed', blurb: 'Upcoming releases for your watchlist in Google or Apple Calendar.' }
]

const cardProps = {
  bg: 'blackAlpha.500',
  border: '1px solid',
  borderColor: 'border.subtle',
  borderRadius: 'lg'
} as const

export default function Plus() {
  const { query } = useRouter()
  const { loading, creds, plus, features, refresh } = usePlusStatus()
  const [busy, setBusy] = useState<'monthly' | 'yearly' | null>(null)
  const [error, setError] = useState('')
  const [justConfirmed, setJustConfirmed] = useState(false)
  const status = firstParam(query.status)
  const success = status === 'success'
  const confirmed = status === 'confirmed'

  // Digest/alert emails link here with sync creds in the fragment (same
  // convention as alerts-link): store them so checkout works on this device.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const email = params.get('email')
    const key = params.get('key')
    if (!email || !key) return
    setAlertsCredentials(email, key)
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (success) trackEvent('plus-subscribed')
    else if (confirmed) trackEvent('waitlist-confirmed')
  }, [success, confirmed])

  const checkout = async (plan: 'monthly' | 'yearly') => {
    if (!creds) return
    setBusy(plan)
    setError('')
    const { url, error } = await startPlusCheckout(creds, plan)
    if (url) {
      trackEvent('plus-checkout-start', { plan })
      window.location.href = url
      return
    }
    setError(error || 'Could not start checkout. Please try again.')
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
        <PageShell withBackButton>
        <Flex direction='column' align='center' textAlign='center'>
          <Heading
            as='h1'
            fontFamily='display'
            fontWeight='normal'
            fontSize={{ base: '2.25rem', md: '3.25rem' }}
            lineHeight={1.1}
            textShadow='0 0 14px rgba(125, 175, 255, 0.28)'
            mt={4}
          >
            Galaxy Plus
          </Heading>
          <Text maxW='36rem' mt={4} color='gray.300'>
            The free tier already syncs your list and ratings across devices. Plus makes your taste profile work harder.
          </Text>
        </Flex>

        {success && (
          <Box mt={8} mx='auto' bg='green.900' border='1px solid var(--chakra-colors-green-700)' borderRadius='lg' p={4} maxW='36rem'>
            <Text color='green.200' fontSize='sm'>
              You&apos;re in! Plus activates as soon as the payment clears, usually within seconds.
            </Text>
          </Box>
        )}
        {(confirmed || justConfirmed) && !loading && (
          <Box mt={8} mx='auto' bg='green.900' border='1px solid var(--chakra-colors-green-700)' borderRadius='lg' p={4} maxW='36rem'>
            <Text color='green.200' fontSize='sm'>
              {plus
                ? 'You\u2019re confirmed — Galaxy Plus is already active on this account.'
                : 'You\u2019re confirmed. Pick a plan below to finish signing up for Plus.'}
            </Text>
          </Box>
        )}

        <Heading as='h2' size='md' mt={12} mb={4} textAlign={{ base: 'center', md: 'left' }}>
          Everything in Plus
        </Heading>
        <SimpleGrid columns={{ base: 1, sm: 2, lg: 3 }} gap={3}>
          {FEATURES.map(({ icon: Icon, title, blurb }) => (
            <Flex key={title} gap={3} align='flex-start' {...cardProps} p={4}>
              <Flex
                flexShrink={0}
                align='center'
                justify='center'
                w={9}
                h={9}
                borderRadius='md'
                bg='whiteAlpha.100'
                color='yellow.300'
                fontSize='lg'
              >
                <Icon />
              </Flex>
              <Box>
                <Text color='white' fontWeight='bold' fontSize='sm'>{title}</Text>
                <Text color='gray.400' fontSize='sm' mt={0.5}>{blurb}</Text>
              </Box>
            </Flex>
          ))}
        </SimpleGrid>

        <Box mt={12}>
          {loading ? null : plus ? (
            <Box {...cardProps} p={5} maxW='36rem' mx={{ base: 'auto', md: 0 }}>
              <Flex align='center' gap={2} mb={1}>
                <Badge colorPalette='yellow'>Plus</Badge>
                <Text color='white' fontWeight='bold' fontSize='sm'>Galaxy Plus is active</Text>
              </Flex>
              <Text color='gray.400' fontSize='sm'>
                Thanks for supporting the site.
                {features?.manageable && (
                  <>
                    {' '}
                    <a
                      href={`/api/billing/portal?email=${encodeURIComponent(creds!.email)}&key=${encodeURIComponent(creds!.key)}`}
                      style={{ textDecoration: 'underline' }}
                    >
                      Manage your subscription
                    </a>
                  </>
                )}
              </Text>
            </Box>
          ) : creds ? (
            <>
              <Heading as='h2' size='md' mb={4} textAlign={{ base: 'center', md: 'left' }}>
                Pick a plan
              </Heading>
              <SimpleGrid columns={{ base: 1, sm: 2 }} gap={4} maxW='42rem'>
                <Flex direction='column' {...cardProps} borderRadius='xl' p={6}>
                  <Text color='white' fontWeight='bold'>Monthly</Text>
                  <Flex align='baseline' gap={1} mt={2}>
                    <Text color='white' fontSize='3xl' fontWeight='bold' lineHeight={1}>$3</Text>
                    <Text color='gray.400' fontSize='sm'>/ month</Text>
                  </Flex>
                  <Text color='gray.500' fontSize='xs' mt={1} mb={5}>Cancel anytime</Text>
                  <Button mt='auto' variant='outline' color='white' borderColor='border.subtle' _hover={{ bg: 'surface.overlay' }}
                    loading={busy === 'monthly'} onClick={() => checkout('monthly')} w='100%'>
                    Go monthly
                  </Button>
                </Flex>
                <Flex
                  direction='column'
                  {...cardProps}
                  borderRadius='xl'
                  p={6}
                  borderColor='yellow.700'
                  boxShadow='0 0 32px rgba(236, 201, 75, 0.07)'
                >
                  <Flex align='center' gap={2}>
                    <Text color='white' fontWeight='bold'>Yearly</Text>
                    <Badge colorPalette='yellow' fontSize='2xs'>Best value</Badge>
                  </Flex>
                  <Flex align='baseline' gap={1} mt={2}>
                    <Text color='white' fontSize='3xl' fontWeight='bold' lineHeight={1}>$20</Text>
                    <Text color='gray.400' fontSize='sm'>/ year</Text>
                  </Flex>
                  <Text color='gray.500' fontSize='xs' mt={1} mb={5}>About $1.67 a month (save 44%)</Text>
                  <Button mt='auto' colorPalette='yellow' loading={busy === 'yearly'} onClick={() => checkout('yearly')} w='100%'>
                    Go yearly
                  </Button>
                </Flex>
              </SimpleGrid>
            </>
          ) : (
            <Box maxW='36rem' mx={{ base: 'auto', md: 0 }}>
              <WaitlistForm purpose='login' onConfirmed={() => { setJustConfirmed(true); refresh() }} />
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
          <DarkInput
            type='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder='you@example.com'
            size='sm'
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
