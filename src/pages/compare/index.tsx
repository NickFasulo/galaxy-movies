import Link from 'next/link'
import { Button, Flex, Heading } from '@chakra-ui/react'
import { COMPARISON_PAGES } from '../../components/ComparisonLinks'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { secondaryButton } from '../../theme'
import { SITE_URL } from '../../lib/site'

export default function CompareIndex() {
  const canonicalUrl = `${SITE_URL}/compare`
  const title = 'Compare Galaxy Movies'
  const description = 'Head-to-head pages: how Galaxy Movies stacks up against other trackers, guides and recommendation apps.'

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Compare', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Heading as='h2' size='md' mt={10} mb={4} textAlign={{ base: 'center', md: 'left' }}>All comparisons</Heading>
        <Flex wrap='wrap' gap={2}>
          {COMPARISON_PAGES.map((p) => (
            <Button key={p.href} asChild size='xs' {...secondaryButton}>
              <Link href={p.href}>vs {p.label}</Link>
            </Button>
          ))}
        </Flex>
      </PageShell>
    </>
  );
}
