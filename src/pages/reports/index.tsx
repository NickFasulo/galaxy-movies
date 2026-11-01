import Link from 'next/link'
import { Box, Button, Flex, Heading, Text } from '@chakra-ui/react'
import PageHead from '../../components/PageHead'
import PageShell from '../../components/PageShell'
import { SITE_URL } from '../../lib/site'
import { secondaryButton } from '../../theme'

export default function ReportsIndex() {
  const canonicalUrl = `${SITE_URL}/reports`
  const title = 'Streaming data reports'
  const description = 'Reports built from Galaxy Movies\' daily tracking of streaming catalogs: churn, arrivals and departures across major services.'

  return (
    <>
      <PageHead
        title={title}
        description={description}
        canonicalUrl={canonicalUrl}
        breadcrumbItems={[
          { name: 'Home', url: SITE_URL },
          { name: 'Reports', url: canonicalUrl }
        ]}
      />
      <PageShell title={title} description={description} withBackButton>
        <Box mt={8}>
          <Heading as='h2' size='md' mb={2}>
            <Link href='/reports/streaming-churn'>Streaming churn</Link>
          </Heading>
          <Text color='gray.300' maxW='42rem'>
            Monthly net adds and losses per service — which catalogs are growing and which are shrinking,
            measured from our own daily tracking.
          </Text>
        </Box>
        <Box mt={8}>
          <Heading as='h2' size='md' mb={3}>Related live lists</Heading>
          <Flex wrap='wrap' gap={2}>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/leaving'>What&apos;s leaving</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/this-month'>This month&apos;s verdicts</Link>
            </Button>
            <Button asChild size='xs' {...secondaryButton}>
              <Link href='/new-on-streaming'>New arrivals</Link>
            </Button>
          </Flex>
        </Box>
      </PageShell>
    </>
  );
}

export async function getStaticProps() {
  return { props: {}, revalidate: 86400 }
}
