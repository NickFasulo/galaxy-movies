import type { ReactNode } from 'react'
import { useRouter } from 'next/router'
import { Heading, Text } from '@chakra-ui/react'
import PageHead from './PageHead'
import PageShell from './PageShell'
import { SITE_URL } from '../utils/site'

export default function InfoPage({ title, description, noindex, children }: { title: string; description: string; noindex?: boolean; children?: ReactNode }) {
  const { asPath } = useRouter()
  const canonicalUrl = `${SITE_URL}${asPath.split('?')[0]}`

  return (
    <>
      <PageHead title={title} description={description} canonicalUrl={canonicalUrl} noindex={noindex} />
      <PageShell maxW='48rem' pb={12}>
        <Heading as='h1' mb={6} textAlign={{ base: 'center', md: 'left' }}>{title}</Heading>
        {children}
      </PageShell>
    </>
  )
}

export function InfoParagraph({ children }: { children?: ReactNode }) {
  return <Text mb={4}>{children}</Text>
}

export function InfoHeading({ children }: { children?: ReactNode }) {
  return <Heading as='h2' size='md' mt={8} mb={3}>{children}</Heading>
}
