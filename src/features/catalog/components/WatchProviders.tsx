import Image from 'next/image'
import { useMemo, useState } from 'react'
import { Box, Flex, Text, Link, NativeSelect } from '@chakra-ui/react';
import { Tooltip } from '@/components/ui/tooltip';
import { isAmazonProvider, buildAmazonAffiliateLink, tagAmazonUrl } from '../../monetize/affiliates'
import { sameStore, type PriceOffer } from '../prices'
import { usePrices } from '../hooks/usePrices'
import { useUserData } from '../../alerts/hooks/useUserData'
import { VPN_AFFILIATE_LINK, VPN_AFFILIATE_PIXEL, VPN_LINK_TEXT } from '../../monetize/affiliates'
import { GRUV_AFFILIATE_PIXEL, GRUV_LINK_TEXT, buildGruvLink } from '../../monetize/affiliates'
import AffiliateTextLink from '../../monetize/components/AffiliateTextLink'
import { LuArrowUpRight } from 'react-icons/lu'
import type { MediaType, WatchProvider, WatchProvidersRegion } from '../../../types/tmdb'

function VpnLink() {
  return <AffiliateTextLink href={VPN_AFFILIATE_LINK} pixel={VPN_AFFILIATE_PIXEL} text={VPN_LINK_TEXT} event='vpn-click' />
}

function GruvLink({ product }: { product?: { url: string; title: string } | null }) {
  if (!product?.url) return null
  return <AffiliateTextLink href={buildGruvLink(product.url)} pixel={GRUV_AFFILIATE_PIXEL} text={GRUV_LINK_TEXT} event='gruv-click' />
}

function ProviderCell({ provider, movieTitle, affiliateLink, isMine, offer, bucket }: {
  provider: WatchProvider
  movieTitle?: string
  affiliateLink?: string | null
  isMine?: boolean
  offer: PriceOffer | null
  bucket: 'stream' | 'free' | 'rent-buy'
}) {
  const caption = offer?.price != null ? `$${offer.price.toFixed(2)}` : null
  const icon = (
    <Flex direction='column' align='center' w='32px'>
      <Box
        position='relative'
        width='32px'
        height='32px'
        borderRadius='0.375rem'
        {...(isMine ? { boxShadow: '0 0 0 1.5px var(--chakra-colors-green-300)' } : {})}
      >
        <Image
          src={provider.logo_path}
          alt={provider.provider_name}
          fill
          sizes='32px'
          style={{ borderRadius: '0.375rem', objectFit: 'cover' }}
        />
      </Box>
      {caption && (
        <Text fontSize='2xs' color='gray.400' mt={0.5} lineHeight={1} lineClamp={1}>
          {caption}
        </Text>
      )}
    </Flex>
  )

  const href = offer?.url
    ? (isAmazonProvider(provider.provider_name) ? tagAmazonUrl(offer.url) : offer.url)
    : (isAmazonProvider(provider.provider_name) ? buildAmazonAffiliateLink(movieTitle) : affiliateLink)

  if (href) {
    return (
      <Tooltip key={provider.provider_id} content={provider.provider_name} showArrow positioning={{
        placement: 'top'
      }}>
        <Link
          href={href}
          rel='sponsored nofollow noopener'
          data-umami-event='provider-click'
          data-umami-event-provider={provider.provider_name}
          data-umami-event-bucket={bucket}
          data-umami-event-title={movieTitle}
          _hover={{ transform: 'scale(1.05)' }}
          transition='transform 0.15s'
          target='_blank'
        >
          {icon}
        </Link>
      </Tooltip>
    );
  }

  return (
    <Tooltip key={provider.provider_id} content={provider.provider_name} showArrow positioning={{
      placement: 'top'
    }}>
      <Box tabIndex={0}>{icon}</Box>
    </Tooltip>
  );
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
  const gruv = priceData?.extras?.gruv

  const seasonNotes = mediaType === 'tv'
    ? offers
        .filter((o) => o.type === 'sub' && o.seasons)
        .map((o) => `${o.provider}: ${o.seasons} season${o.seasons === 1 ? '' : 's'}`)
    : []

  const footerNotes = [
    offers.some((o) => o.price != null) && 'Prices via Watchmode · Apple',
    criticScore != null && `Critics score: ${criticScore}/100`
  ].filter(Boolean).join(' · ')

  return (
    <>
      <Box p={4} bg='blackAlpha.500' borderRadius='lg' border='1px solid var(--chakra-colors-border-subtle)' backdropFilter='blur(10px)'>
        <Flex align='center' justify='space-between' mb={2} gap={2}>
          <Text color='gray.100' fontWeight='semibold' fontSize='xs' letterSpacing='0.08em' textTransform='uppercase' flexShrink={0}>
            Where to Watch
          </Text>
          {regionOptions.length > 1 && (
            <NativeSelect.Root size='xs' w='auto'>
              <NativeSelect.Field
                value={activeRegion}
                onChange={(e) => setChosenRegion(e.target.value)}
                color='gray.300'
                borderColor='border.subtle'
                aria-label='Availability region'
                css={{
                  '& option': { color: 'black' }
                }}>
                {regionOptions.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
          {streamLink && (
            <Link
              href={streamLink}
              data-umami-event='justwatch-click'
              fontSize='2xs'
              color='gray.500'
              display='inline-flex'
              alignItems='center'
              gap={0.5}
              transition='color 0.15s'
              _hover={{ color: 'white' }}
              flexShrink={0}
              target='_blank'
              rel='noopener noreferrer'>
              JustWatch <LuArrowUpRight />
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
                    <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} isMine={myProviderIds?.has(provider.provider_id)} offer={bestOfferFor(provider.provider_name, offers)} bucket='stream' />
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
                    <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} offer={bestOfferFor(provider.provider_name, offers)} bucket='free' />
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
                      <ProviderCell key={provider.provider_id} provider={provider} movieTitle={movieTitle} affiliateLink={affiliateLinks[provider.provider_name]} offer={bestOfferFor(provider.provider_name, offers)} bucket='rent-buy' />
                    ))}
                </Flex>
                <Flex align='center' justify='space-between' gap={2} mt={1.5} wrap='wrap'>
                  <Text color='gray.500' fontSize='2xs'>
                    {[
                      cheapestRent && `Rent from ${formatPrice(cheapestRent)}`,
                      cheapestBuy && `Buy from ${formatPrice(cheapestBuy)}`
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  <GruvLink product={gruv} />
                </Flex>
              </Box>
            )}
          </>
        ) : (
          <Box>
            <Text color='gray.300' fontSize='xs' mb={1.5}>
              Not currently available to stream — a VPN can sometimes unlock it in another region.
            </Text>
            <Flex align='center' gap={4} wrap='wrap'>
              <GruvLink product={gruv} />
              <VpnLink />
            </Flex>
          </Box>
        )}
        {(hasProviders || !!footerNotes) && (
          <Flex align='center' justify='space-between' gap={2} mt={2} wrap='wrap'>
            <Text color='gray.600' fontSize='2xs'>{footerNotes}</Text>
            {hasProviders && <VpnLink />}
          </Flex>
        )}
      </Box>
    </>
  );
}
