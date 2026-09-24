import Image from 'next/image'
import NextLink from 'next/link'
import { Box, Flex, Text, Tooltip, Link } from '@chakra-ui/react'

export default function WatchProviders({ watchProviders }) {
  if (!watchProviders) return null

  const flatrate = watchProviders.flatrate || []
  const rent = watchProviders.rent || []
  const buy = watchProviders.buy || []
  const streamLink = watchProviders.link

  if (!flatrate.length && !rent.length && !buy.length) return null

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
        {flatrate.length > 0 && (
          <Box mb={2}>
            <Text color='gray.300' fontSize='xs' mb={1.5}>
              Stream
            </Text>
            <Flex wrap='wrap' gap={{ base: 4, md: 2 }}>
              {flatrate.map((provider) => (
                <Tooltip key={provider.provider_id} label={provider.provider_name} hasArrow placement='top'>
                  <Box position='relative' width='32px' height='32px'>
                    <Image
                      src={provider.logo_path}
                      alt={provider.provider_name}
                      fill
                      style={{ borderRadius: '0.375rem', objectFit: 'cover' }}
                    />
                  </Box>
                </Tooltip>
              ))}
            </Flex>
          </Box>
        )}
        {(rent.length > 0 || buy.length > 0) && (
          <Box>
            <Text color='gray.300' fontSize='xs' mb={1.5}>
              Rent / Buy
            </Text>
            <Flex wrap='wrap' gap={{ base: 4, md: 2 }}>
              {[...rent, ...buy]
                .filter((v, i, a) => a.findIndex((t) => t.provider_id === v.provider_id) === i)
                .map((provider) => (
                  <Tooltip key={provider.provider_id} label={provider.provider_name} hasArrow placement='top'>
                    <Box position='relative' width='32px' height='32px'>
                      <Image
                        src={provider.logo_path}
                        alt={provider.provider_name}
                        fill
                        style={{ borderRadius: '0.375rem', objectFit: 'cover' }}
                      />
                    </Box>
                  </Tooltip>
                ))}
            </Flex>
          </Box>
        )}
      </Box>

      <Text color='gray.500' fontSize='xs' mt={2} textAlign='center'>
        <NextLink href='/disclosure'>Affiliate disclosure</NextLink>
      </Text>
    </>
  )
}