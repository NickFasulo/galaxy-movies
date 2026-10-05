import Head from 'next/head'
import { useRouter } from 'next/router'
import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Box } from '@chakra-ui/react'
import { firstParam } from '../utils/query'

const STATUSES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: "You're confirmed",
    body: "Thanks — we'll email you when streaming alerts launch on Galaxy Movies."
  },
  unsubscribed: {
    title: 'Unsubscribed',
    body: "You've been removed from the alerts list. You won't hear from us again."
  },
  error: {
    title: 'Link invalid or expired',
    body: "This link didn't work — it may have already been used or expired. You can sign up again from your list page."
  }
}

export default function EmailStatus() {
  const { query } = useRouter()
  const status = STATUSES[firstParam(query.status) ?? ''] || STATUSES.error

  return (
    <>
      <Head>
        <meta name='robots' content='noindex' />
      </Head>
      <InfoPage title={status.title} description={status.body}>
        <InfoParagraph>{status.body}</InfoParagraph>
        <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
          <BackButton />
        </Box>
      </InfoPage>
    </>
  )
}
