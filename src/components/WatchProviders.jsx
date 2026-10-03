import Image from 'next/image'
import NextLink from 'next/link'
import { Box, Flex, Text, Tooltip, Link } from '@chakra-ui/react'
import { isAmazonProvider, buildAmazonAffiliateLink } from '../utils/amazonAffiliate'
// import { SURFSHARK_AFFILIATE_LINK, SURFSHARK_LINK_TEXT } from '../utils/surfsharkAffiliate'

// Affiliate monetization disabled — uncomment SurfsharkLink + its usages to re-enable.
// eslint-disable-next-line no-unused-vars
function SurfsharkLink() {
  return (
    <Link
      href={SURFSHARK_AFFILIATE_LINK}
      isExternal
      rel='sponsored nofollow noopener'
      fontSize='xs'
      color='gray.400'
      _hover={{ color: 'white' }}
    >
      {SURFSHARK_LINK_TEXT} ↗
    </Link>
  )
}

function ProviderIcon({ provider, movieTitle, affiliateLink, isMine }) {
  const icon = (
    <Box
      position='relative'
      width='32px'
      height='32px'
      borderRadius='0.375rem'
      {...(isMine ? { boxShadow: '0 0 0 2px #48bb78' } : {})}
    >
      <Image
        src={provider.logo_path}
        alt={provider.provider_name}
        fill
        style={{ borderRadius: '0.375rem', objectFit: 'cover' }}
      />
    </Box>
  )

  const href = isAmazonProvider(provider.provider_name)
    ? buildAmazonAffiliateLink(movieTitle)
    : affiliateLink

  if (href) {
    return (
      <Tooltip key={provider.provider_id} label={provider.provider_name} hasArrow placement='top'>
        <Link
          href={href}
          isExternal
          rel='sponsored nofollow noopener'
          _hover={{ transform: 'scale(1.05)' }}
          transition='transform 0.15s'
        >
          {icon}
        </Link>
      </Tooltip>
    )
  }

  return (
    <Tooltip key={provider.provider_id} label={provider.provider_name} hasArrow placement='top'>
      {icon}
    </Tooltip>
  )
}

export default function WatchProviders({ watchProviders, movieTitle, affiliateLinks = {}, myProviderIds }) {
  const flatrate = watchProviders?.flatrate || []
  const rent = watchProviders?.rent || []
  const buy = watchProviders?.buy || []
  const streamLink = watchProviders?.link
  const hasProviders = flatrate.length > 0 || rent.length > 0 || buy.length > 0

  return (
    <>
      <Box p={3} bg='blackAlpha.600' borderRadius='1rem' border='1px solid' borderColor='whiteAlpha.200'>
        <Flex align='center' justify='space-between' mb={2}>
          <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase'>
            Where to Watch
          </Text>
          {streamLink && (
            <Link href={streamLink} isExternal fontSize='xs' color='gray.400' _hover={{ color: 'white' }}>
              JustWatch ↗
            </Link>
          )}
        </Flex>
        {hasProviders ? (
          <>
            {flatrate.length > 0 && (
              <Box mb={2}>
                <Text color='gray.300' fontSize='xs' mb={1.5}>
                  Stream
                </Text>
                <Flex wrap='wrap' gap={{ base: 4, md: 2 }}>
                  {flatrate.map((provider) => (
                    <ProviderIcon key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} isMine={myProviderIds?.has(provider.provider_id)} />
                  ))}
                </Flex>
              </Box>
            )}
            {(rent.length > 0 || buy.length > 0) && (
              <Box mb={2}>
                <Text color='gray.300' fontSize='xs' mb={1.5}>
                  Rent / Buy
                </Text>
                <Flex wrap='wrap' gap={{ base: 4, md: 2 }}>
                  {[...rent, ...buy]
                    .filter((v, i, a) => a.findIndex((t) => t.provider_id === v.provider_id) === i)
                    .map((provider) => (
                      <ProviderIcon key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} />
                    ))}
                </Flex>
              </Box>
            )}
            {/* <SurfsharkLink /> */}
          </>
        ) : (
          <Box>
            <Text color='gray.300' fontSize='xs' mb={1.5}>
              Not currently available to stream — a VPN can sometimes unlock it in another region.
            </Text>
            {/* <SurfsharkLink /> */}
          </Box>
        )}
      </Box>

      <Text color='gray.500' fontSize='xs' mt={2} textAlign='center'>
        <NextLink href='/disclosure'>Affiliate disclosure</NextLink>
      </Text>
    </>
  )
}