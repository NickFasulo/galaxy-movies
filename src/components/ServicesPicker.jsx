import { Box, Button, Checkbox, Flex, SimpleGrid, Text } from '@chakra-ui/react'
import { useUserData } from '../hooks/useUserData'
import { setServices } from '../utils/userData'
import { streamingProviders, isProviderAvailableInRegion } from '../utils/tmdb'

// Only regions the site's provider data actually models (see tmdb.js ids).
const REGIONS = [
  { code: 'US', label: 'United States' },
  { code: 'IN', label: 'India' }
]

export default function ServicesPicker() {
  const data = useUserData()
  const { region, providers } = data.services

  const visibleProviders = Object.entries(streamingProviders)
    .filter(([key]) => isProviderAvailableInRegion(key, region))
    .map(([key, provider]) => ({ key, label: provider.title.replace(' Movies', '') }))

  const toggle = (key) => {
    const next = providers.includes(key)
      ? providers.filter((p) => p !== key)
      : [...providers, key]
    setServices(region, next)
  }

  const changeRegion = (code) => {
    setServices(code, providers.filter((key) => isProviderAvailableInRegion(key, code)))
  }

  return (
    <Box bg='blackAlpha.500' border='1px solid' borderColor='whiteAlpha.200' borderRadius='1rem' p={4}>
      <Flex align='center' justify='space-between' wrap='wrap' gap={3}>
        <Text color='white' fontWeight='bold' fontSize='xs' textTransform='uppercase'>
          My streaming services
        </Text>
        <Flex gap={2}>
          {REGIONS.map((r) => (
            <Button
              key={r.code}
              size='xs'
              variant={region === r.code ? 'solid' : 'outline'}
              colorScheme={region === r.code ? 'blue' : 'whiteAlpha'}
              onClick={() => changeRegion(r.code)}
            >
              {r.label}
            </Button>
          ))}
        </Flex>
      </Flex>
      <Text color='gray.500' fontSize='xs' mb='0.75rem'>
        Pick your subscriptions to see which saved movies are streaming for you.
      </Text>
      <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2}>
        {visibleProviders.map((provider) => (
          <Checkbox
            key={provider.key}
            isChecked={providers.includes(provider.key)}
            onChange={() => toggle(provider.key)}
            color='gray.200'
            size='sm'
          >
            {provider.label}
          </Checkbox>
        ))}
      </SimpleGrid>
    </Box>
  )
}
