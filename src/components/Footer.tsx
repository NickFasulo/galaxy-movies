import NextLink from 'next/link'
import { Fragment } from 'react'
import type { IconType } from 'react-icons'
import { FaBluesky, FaDiscord, FaFacebookF, FaMastodon, FaRedditAlien, FaTelegram } from 'react-icons/fa6'
import { Box, Flex, Link, Text } from '@chakra-ui/react'
import { SOCIAL_PROFILES } from '../lib/site'

const ITEMS = [
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
  { href: '/disclosure', label: 'Disclosure' }
]

export function LegalLinks() {
  return (
    <>
      {ITEMS.map((item, i) => (
        <Fragment key={item.href}>
          {i > 0 && <Text as='span' color='gray.600' mx={2}>·</Text>}
          <Link color='gray.400' fontSize='xs' transition='color 0.15s' _hover={{ color: 'white' }} asChild>
            <NextLink href={item.href}>{item.label}</NextLink>
          </Link>
        </Fragment>
      ))}
    </>
  );
}

const SOCIAL_ICONS: Record<string, IconType> = {
  Facebook: FaFacebookF,
  Bluesky: FaBluesky,
  Mastodon: FaMastodon,
  Reddit: FaRedditAlien,
  Telegram: FaTelegram,
  Discord: FaDiscord
}

export function SocialLinks() {
  return (
    <>
      {SOCIAL_PROFILES.map((p) => {
        const Icon = SOCIAL_ICONS[p.name]
        if (!Icon) return null
        return (
          <Link
            key={p.name}
            href={p.href}
            target='_blank'
            rel={p.relMe ? 'me noopener noreferrer' : 'noopener noreferrer'}
            aria-label={`Galaxy Movies on ${p.name}`}
            title={p.name}
            color='gray.500'
            lineHeight={1}
            transition='color 0.15s'
            _hover={{ color: 'white' }}
          >
            <Icon size={14} />
          </Link>
        )
      })}
    </>
  )
}

// Floating legal-links pill for infinite-scroll pages — an in-flow footer
// would sit below a feed that never ends (same pattern as the homepage).
export function FooterPill() {
  return (
    <Box
      as='footer'
      position='fixed'
      bottom='calc(0.5rem + env(safe-area-inset-bottom))'
      left='0'
      right='0'
      mx='auto'
      zIndex={9}
      py='0.25rem'
      px='1rem'
      w='fit-content'
      bg='rgba(31, 37, 43, 0.72)'
      border='1px solid var(--chakra-colors-border-subtle)'
      borderRadius='full'
      backdropFilter='blur(10px)'
    >
      <Text textAlign='center'>
        <LegalLinks />
      </Text>
    </Box>
  )
}

// Excluded on the homepage in _app.jsx — its infinite scroll has no stable
// "bottom" for an in-flow footer, so it uses its own fixed legal pill instead.
export default function Footer({ isDark = false }) {
  // renders outside the page's own Box, so match the dark background explicitly
  const bg = isDark ? 'surface.canvas' : 'transparent'

  return (
    <Box as='footer' bg={bg} mt='auto'>
      <Flex justify='center' gap={5} pt={4}>
        <SocialLinks />
      </Flex>
      <Text textAlign='center' pb={4} pt={2}>
        <LegalLinks />
      </Text>
    </Box>
  )
}
