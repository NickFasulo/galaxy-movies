import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Box, Flex, Text, Tooltip, Link, Select } from '@chakra-ui/react'
import { isAmazonProvider, buildAmazonAffiliateLink } from '../utils/amazonAffiliate'
import { sameStore, type PriceOffer } from '../utils/prices'
import { usePrices } from '../hooks/usePrices'
import { useUserData } from '../hooks/useUserData'
import { SURFSHARK_AFFILIATE_LINK, SURFSHARK_LINK_TEXT } from '../utils/surfsharkAffiliate'
import type { MediaType, WatchProvider, WatchProvidersRegion } from '../types/tmdb'

// Affiliate monetization disabled — uncomment SurfsharkLink + its usages to re-enable.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function ProviderCell({ provider, movieTitle, affiliateLink, isMine, offer }: {
  provider: WatchProvider
  movieTitle?: string
  affiliateLink?: string | null
  isMine?: boolean
  offer: PriceOffer | null
}) {
  const caption = offer?.price != null ? `$${offer.price.toFixed(2)}` : null
  const icon = (
    <Flex direction='column' align='center' w='32px'>
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
      {caption && (
        <Text fontSize='2xs' color='gray.400' mt={0.5} lineHeight={1} noOfLines={1}>
          {caption}
        </Text>
      )}
    </Flex>
  )

  const href = offer?.url || (isAmazonProvider(provider.provider_name)
    ? buildAmazonAffiliateLink(movieTitle)
    : affiliateLink)

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

// Cheapest offer for a provider across a given offer type — rent preferred,
// then buy, then anything with a deep link.
function bestOfferFor(providerName: string, offers: PriceOffer[]): PriceOffer | null {
  const matching = offers.filter((o) => sameStore(o.provider, providerName))
  const ranked = matching
    .filter((o) => o.type === 'rent' || o.type === 'buy')
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))
  return ranked[0] || matching.find((o) => o.url) || null
}

const formatPrice = (offer: PriceOffer | null | undefined) =>
  offer ? `$${(offer.price ?? 0).toFixed(2)} on ${offer.provider}` : null

export default function WatchProviders({
  watchProviders,
  allWatchProviders,
  detectedRegion,
  movieTitle,
  affiliateLinks = {},
  myProviderIds,
  tmdbId,
  mediaType = 'movie',
  releaseYear
}: {
  watchProviders?: WatchProvidersRegion | null
  allWatchProviders?: Record<string, WatchProvidersRegion> | null
  detectedRegion?: string
  movieTitle?: string
  affiliateLinks?: Record<string, string | null>
  myProviderIds?: Set<number>
  tmdbId: number
  mediaType?: MediaType
  releaseYear?: string | number | null
}) {
  const { services } = useUserData()
  const [chosenRegion, setChosenRegion] = useState<string | null>(null)

  const regionOptions = useMemo(() => Object.keys(allWatchProviders || {}).sort(), [allWatchProviders])
  const defaultRegion = regionOptions.includes(services.region)
    ? services.region
    : detectedRegion || 'US'
  const activeRegion = chosenRegion || defaultRegion

  const bucket: WatchProvidersRegion = allWatchProviders?.[activeRegion] || watchProviders || {}
  const flatrate = bucket.flatrate || []
  const rent = bucket.rent || []
  const buy = bucket.buy || []
  const freeAds = [...(bucket.free || []), ...(bucket.ads || [])]
    .filter((v, i, a) => a.findIndex((t) => t.provider_id === v.provider_id) === i)
  const streamLink = bucket.link
  const hasProviders = flatrate.length > 0 || rent.length > 0 || buy.length > 0 || freeAds.length > 0

  const { data: priceData } = usePrices({
    tmdbId,
    mediaType,
    title: movieTitle,
    year: releaseYear,
    region: activeRegion
  })
  const offers = priceData?.offers || []
  const cheapestRent = priceData?.cheapest?.rent
  const cheapestBuy = priceData?.cheapest?.buy
  const criticScore = priceData?.extras?.criticScore

  const seasonNotes = mediaType === 'tv'
    ? offers
        .filter((o) => o.type === 'sub' && o.seasons)
        .map((o) => `${o.provider}: ${o.seasons} season${o.seasons === 1 ? '' : 's'}`)
    : []

  return (
    <>
      <Box p={3} bg='blackAlpha.600' borderRadius='1rem' border='1px solid' borderColor='whiteAlpha.200'>
        <Flex align='center' justify='space-between' mb={2} gap={2}>
          <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase' flexShrink={0}>
            Where to Watch
          </Text>
          {regionOptions.length > 1 && (
            <Select
              size='xs'
              w='auto'
              value={activeRegion}
              onChange={(e) => setChosenRegion(e.target.value)}
              color='gray.300'
              borderColor='whiteAlpha.300'
              aria-label='Availability region'
              sx={{ option: { color: 'black' } }}
            >
              {regionOptions.map((code) => (
                <option key={code} value={code}>{code}</option>
              ))}
            </Select>
          )}
          {streamLink && (
            <Link href={streamLink} isExternal fontSize='xs' color='gray.400' _hover={{ color: 'white' }} flexShrink={0}>
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
                <Flex wrap='wrap' gap={{ base: 4, md: 2 }} align='flex-start'>
                  {flatrate.map((provider) => (
                    <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} isMine={myProviderIds?.has(provider.provider_id)} offer={bestOfferFor(provider.provider_name, offers)} />
                  ))}
                </Flex>
                {seasonNotes.length > 0 && (
                  <Text color='gray.500' fontSize='2xs' mt={1.5}>
                    {seasonNotes.join(' · ')}
                  </Text>
                )}
              </Box>
            )}
            {freeAds.length > 0 && (
              <Box mb={2}>
                <Text color='gray.300' fontSize='xs' mb={1.5}>
                  Watch free
                </Text>
                <Flex wrap='wrap' gap={{ base: 4, md: 2 }} align='flex-start'>
                  {freeAds.map((provider) => (
                    <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} offer={bestOfferFor(provider.provider_name, offers)} />
                  ))}
                </Flex>
              </Box>
            )}
            {(rent.length > 0 || buy.length > 0) && (
              <Box mb={2}>
                <Text color='gray.300' fontSize='xs' mb={1.5}>
                  Rent / Buy
                </Text>
                <Flex wrap='wrap' gap={{ base: 4, md: 2 }} align='flex-start'>
                  {[...rent, ...buy]
                    .filter((v, i, a) => a.findIndex((t) => t.provider_id === v.provider_id) === i)
                    .map((provider) => (
                      <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} offer={bestOfferFor(provider.provider_name, offers)} />
                    ))}
                </Flex>
                {(cheapestRent || cheapestBuy) && (
                  <Text color='gray.500' fontSize='2xs' mt={1.5}>
                    {[
                      cheapestRent && `Rent from ${formatPrice(cheapestRent)}`,
                      cheapestBuy && `Buy from ${formatPrice(cheapestBuy)}`
                    ].filter(Boolean).join(' · ')}
                  </Text>
                )}
              </Box>
            )}
            {offers.some((o) => o.price != null) && (
              <Text color='gray.600' fontSize='2xs' mt={1}>
                Prices via Watchmode · Apple
              </Text>
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
        {criticScore != null && (
          <Text color='gray.500' fontSize='2xs' mt={2}>
            Critics score: {criticScore}/100
          </Text>
        )}
      </Box>
    </>
  )
}
