import { useEffect, useState } from 'react'
import { Flex, Switch, Text } from '@chakra-ui/react'
import type { AlertsCredentials } from '../alertsSync'
import { getPushSubscription, isIOS, isStandalone, pushSupport, subscribePush, unsubscribePush, type PushSupport } from '../push'

// iOS Safari delivers push only to installed PWAs — surfaced pre-signup too,
// so visitors know the install path before they ever hold credentials.
export function PushInstallHint() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let live = true
    void (async () => {
      const iosInstall = isIOS() && !isStandalone()
      if (live) setShow(iosInstall)
    })()
    return () => { live = false }
  }, [])
  if (!show) return null
  return (
    <Text color='gray.400' fontSize='sm' mt={3}>
      On iPhone/iPad? Install via Share → &quot;Add to Home Screen&quot; — that unlocks push alerts on this device.
    </Text>
  )
}

// Per-device push toggle — subscriptions live server-side keyed by endpoint,
// so this reflects whether THIS browser is registered, not other devices.
export default function PushAlerts({ creds }: { creds: AlertsCredentials }) {
  const [support, setSupport] = useState<PushSupport | null>(null)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)

  // Mount-time browser API reads — a lazy initializer would mismatch SSR HTML.
  useEffect(() => {
    let live = true
    void (async () => {
      const s = pushSupport()
      const sub = s === 'ready' ? await getPushSubscription() : null
      if (!live) return
      setSupport(s)
      setOn(Boolean(sub))
    })()
    return () => { live = false }
  }, [])

  if (support === null || support === 'unsupported') return null

  const toggle = async () => {
    setBusy(true)
    try {
      const ok = on ? await unsubscribePush(creds) : await subscribePush(creds)
      if (ok) {
        setOn(!on)
        if (!on) setSupport(pushSupport())
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Text color='gray.300' fontSize='xs' mt={4} mb={1} fontWeight='bold'>Push alerts</Text>
      {support === 'ios-install' ? (
        <Text color='gray.400' fontSize='sm'>
          On iPhone/iPad, alerts need the app installed first: tap Share → &quot;Add to Home Screen&quot;, then come back here to enable them.
        </Text>
      ) : support === 'blocked' ? (
        <Text color='gray.400' fontSize='sm'>
          Notifications are blocked for this site: enable them in your browser&apos;s site settings to get alerts on this device.
        </Text>
      ) : (
        <Flex align='center' gap={3}>
          <Switch.Root
            checked={on}
            onCheckedChange={toggle}
            disabled={busy}
            colorPalette='green'
            size='sm'
          >
            <Switch.HiddenInput />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
          <Text color='gray.400' fontSize='sm'>
            {on
              ? 'On for this device: alerts arrive here instead of email.'
              : 'New arrivals and coming-soon dates land on this device, free.'}
          </Text>
        </Flex>
      )}
    </>
  )
}
