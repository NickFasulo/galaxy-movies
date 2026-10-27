import { useState } from 'react'
import NextLink from 'next/link'
import { Badge, Box, Button, Flex, Link, Text } from '@chakra-ui/react'
import { usePlusStatus } from '../hooks/usePlus'
import type { AlertsCredentials } from '../../alerts/alertsSync'

export async function startPlusCheckout(creds: AlertsCredentials, plan: 'monthly' | 'yearly'): Promise<{ url?: string; error?: string }> {
  try {
    const resp = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, key: creds.key, plan })
    })
    const data = await resp.json().catch(() => ({}))
    if (resp.ok && data.url) return { url: data.url }
    return { error: data.error || 'Could not start checkout. Please try again.' }
  } catch {
    return { error: 'Could not start checkout. Please try again.' }
  }
}

// Renders nothing for active Plus subscribers or while status loads. Without
// alert creds the card degrades to a /plus link, since checkout needs them.
export default function PlusUpsell() {
  const { loading, creds, plus } = usePlusStatus()
  const [busy, setBusy] = useState<'monthly' | 'yearly' | null>(null)
  const [error, setError] = useState('')

  if (loading || plus) return null

  const checkout = async (plan: 'monthly' | 'yearly') => {
    if (!creds) return
    setBusy(plan)
    setError('')
    const { url, error } = await startPlusCheckout(creds, plan)
    if (url) {
      window.location.href = url
      return
    }
    setError(error || 'Could not start checkout. Please try again.')
    setBusy(null)
  }

  return (
    <Box bg='blackAlpha.500' border='1px solid var(--chakra-colors-border-subtle)' borderRadius='lg' p={4}>
      <Flex align='center' gap={2} mb={1}>
        <Badge colorPalette='yellow'>Plus</Badge>
        <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase'>Galaxy Plus</Text>
      </Flex>
      <Text color='gray.400' fontSize='sm' mb={3}>
        Leaving-soon warnings, next-episode alerts, and every provider we track — $3/mo or $20/yr.
      </Text>
      {creds ? (
        <>
          <Flex gap={2} wrap='wrap'>
            <Button size='sm' colorPalette='yellow' loading={busy === 'monthly'} onClick={() => checkout('monthly')}>
              $3 / month
            </Button>
            <Button size='sm' variant='outline' loading={busy === 'yearly'} onClick={() => checkout('yearly')}>
              $20 / year
            </Button>
            <Link asChild color='gray.300' fontSize='xs' alignSelf='center' _hover={{ color: 'white' }}>
              <NextLink href='/plus'>What&apos;s included</NextLink>
            </Link>
          </Flex>
          {error && <Text color='red.300' fontSize='xs' mt={2}>{error}</Text>}
        </>
      ) : (
        <Button asChild size='sm' variant='outline'>
          <NextLink href='/plus'>See Plus</NextLink>
        </Button>
      )}
    </Box>
  )
}
