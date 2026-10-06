import Link from 'next/link'
import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Box } from '@chakra-ui/react'

export default function Privacy() {
  return (
    <InfoPage title='Privacy Policy' description='Read the Galaxy Movies privacy policy.'>
      <InfoParagraph>Galaxy Movies does not require an account. Your saved movies, ratings, and streaming service preferences are stored in your browser&apos;s local storage on your device, and are not shared with third parties.</InfoParagraph>
      <InfoParagraph>When you chat with Galaxy Bot, a summary of your ratings and saved movies is sent with your request so recommendations reflect your taste. This summary is not stored or linked to you.</InfoParagraph>
      <InfoParagraph>If you confirm your email for streaming alerts, we also store a copy of your saved list and chosen streaming services on our servers, keyed to that email address, so we can check it against new streaming availability and notify you of matches. This copy is deleted when you unsubscribe or after a few months of inactivity. Every email we send includes an unsubscribe link, and you can ask us to delete your address at any time via the contact page.</InfoParagraph>
      <InfoParagraph>We may receive standard technical information from hosting and security services, such as request timestamps, browser type, and approximate location. This information is used to operate and protect the site.</InfoParagraph>
      <InfoParagraph>We use Vercel Analytics to measure aggregated page views and performance. These events do not include movie search terms or personal identifiers.</InfoParagraph>
      <InfoParagraph>Some outbound &quot;where to watch&quot; links route through affiliate redirect services that record the click for commission attribution — see our <Link href='/disclosure'>affiliate disclosure</Link> for details.</InfoParagraph>
      <Box mt='2rem' textAlign={{ base: 'center', md: 'left' }}>
        <BackButton />
      </Box>
    </InfoPage>
  )
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}
