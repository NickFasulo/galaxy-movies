import { useState } from 'react'
import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next'
import Link from 'next/link'
import { Box, Button, Flex, Heading, SimpleGrid, Text } from '@chakra-ui/react'
import PageHead from '../components/PageHead'
import PageShell from '../components/PageShell'
import { embeddableProviders, providerLabel } from '../features/catalog/embed'
import { setSwrCache } from '../lib/ssr'
import { SITE_URL } from '../lib/site'

const PROVIDERS = embeddableProviders()

interface Props {
  initialProvider: string
}

export async function getServerSideProps({ query, res }: GetServerSidePropsContext): Promise<GetServerSidePropsResult<Props>> {
  const raw = Array.isArray(query.provider) ? query.provider[0] : query.provider
  const initialProvider = PROVIDERS.some((p) => p.key === raw) ? (raw as string) : 'netflix'
  setSwrCache(res, 86400, 604800)
  return { props: { initialProvider } }
}

export default function Widgets({ initialProvider }: Props) {
  const [provider, setProvider] = useState(initialProvider)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [copied, setCopied] = useState(false)

  const label = providerLabel(provider)
  // Preview uses a relative src so it works on localhost and preview deploys;
  // the snippet handed to site owners keeps the absolute production URL.
  const embedUrl = `${SITE_URL}/embed/${provider}${theme === 'light' ? '?theme=light' : ''}`
  const previewUrl = `/embed/${provider}${theme === 'light' ? '?theme=light' : ''}`
  const snippet = `<iframe src="${embedUrl}" width="100%" height="420" style="border:0;border-radius:12px" loading="lazy" title="New on ${label} - Galaxy Movies"></iframe>`
  const apiUrl = `${SITE_URL}/api/streaming-changes?provider=${provider}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const canonicalUrl = `${SITE_URL}/widgets`
  const title = 'Free Streaming Changes Widget'
  const description = `Embed a live "what's new and leaving" list for major streaming services on your site — free, updated daily.`

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: title,
          description,
          url: canonicalUrl
        }}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Widgets', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Text maxW='42rem' mt={2} color='gray.400'>
          The same daily catalog data behind our{' '}
          <Link href='/leaving' style={{ textDecoration: 'underline' }}>added &amp; leaving lists</Link>, packaged for your
          site or app. Free with attribution: keep the &quot;Powered by Galaxy Movies&quot; link.
        </Text>

        <Heading as='h2' size='md' mt={10} mb={4}>Pick a service</Heading>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
          {PROVIDERS.map((p) => (
            <Button
              key={p.key}
              size='sm'
              variant={p.key === provider ? 'solid' : 'outline'}
              colorPalette={p.key === provider ? 'yellow' : undefined}
              borderColor='border.subtle'
              onClick={() => setProvider(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </SimpleGrid>

        <Flex mt={4} gap={2} align='center'>
          <Text fontSize='sm' color='gray.400'>Theme:</Text>
          {(['dark', 'light'] as const).map((t) => (
            <Button key={t} size='xs' variant={theme === t ? 'solid' : 'outline'} colorPalette={theme === t ? 'yellow' : undefined} borderColor='border.subtle' onClick={() => setTheme(t)}>
              {t}
            </Button>
          ))}
        </Flex>

        <Heading as='h2' size='md' mt={10} mb={4}>Preview</Heading>
        <Box borderRadius='xl' overflow='hidden' border='1px solid' borderColor='border.subtle' maxW='30rem'>
          <iframe
            key={previewUrl}
            src={previewUrl}
            width='100%'
            height='420'
            style={{ border: 0, display: 'block' }}
            title={`New on ${label} - Galaxy Movies`}
          />
        </Box>

        <Heading as='h2' size='md' mt={10} mb={4}>Embed code</Heading>
        <Box
          as='pre'
          p={4}
          borderRadius='lg'
          bg='surface.overlay'
          border='1px solid'
          borderColor='border.subtle'
          fontSize='xs'
          whiteSpace='pre-wrap'
          wordBreak='break-all'
          maxW='42rem'
        >
          {snippet}
        </Box>
        <Button mt={3} size='sm' variant='outline' borderColor='border.subtle' onClick={copy}>
          {copied ? 'Copied' : 'Copy embed code'}
        </Button>
        <Text mt={3} fontSize='sm' color='gray.500' maxW='42rem'>
          Adjust <Text as='code'>height</Text> to fit your layout. Add <Text as='code'>?theme=light</Text> to the widget URL for light backgrounds.
        </Text>

        <Heading as='h2' size='md' mt={12} mb={4}>JSON feed</Heading>
        <Text maxW='42rem' color='gray.400' fontSize='sm'>
          Prefer raw data? The same diffs are available as JSON — <Text as='code'>added</Text>, <Text as='code'>left</Text> and{' '}
          <Text as='code'>coming</Text> titles per service, refreshed daily. No key required; free usage is 120 requests/hour.
        </Text>
        <Box
          as='pre'
          mt={4}
          p={4}
          borderRadius='lg'
          bg='surface.overlay'
          border='1px solid'
          borderColor='border.subtle'
          fontSize='xs'
          whiteSpace='pre-wrap'
          wordBreak='break-all'
          maxW='42rem'
        >
{`curl "${apiUrl}"

{
  "provider": "${provider}",
  "source": "${label}",
  "updatedAt": 1761177600000,
  "coming": [{ "tmdbId": 123, "tmdbType": "movie", "title": "...", "date": "2025-10-24", "season": null }],
  "added": [{ "tmdbId": 456, "tmdbType": "movie", "title": "...", "year": 2025 }],
  "left":  [{ "tmdbId": 789, "tmdbType": "tv", "title": "...", "year": 2024 }],
  "attribution": { "text": "Powered by Galaxy Movies", "url": "${SITE_URL}/leaving/${provider}" }
}`}
        </Box>
        <Text mt={3} fontSize='sm' color='gray.500' maxW='42rem'>
          Use <Text as='code'>?provider=all</Text> for every tracked service in one response. CORS is open, so it works from
          browser fetch and server jobs alike.
        </Text>

        <Text mt={12} color='gray.500' fontSize='sm' maxW='42rem'>
          US catalogs, updated daily. Departure dates mark when a title was detected leaving the service. For commercial
          licensing or bulk feeds, <Link href='/contact' style={{ textDecoration: 'underline' }}>get in touch</Link>.
        </Text>
      </PageShell>
    </>
  )
}
