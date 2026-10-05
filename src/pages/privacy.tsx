import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Box } from '@chakra-ui/react'

export default function Privacy() {
  return (
    <InfoPage title='Privacy Policy' description='Read the Galaxy Movies privacy policy.'>
      <InfoParagraph>Galaxy Movies does not require an account. Your saved movies, ratings, and streaming service preferences are stored only in your browser&apos;s local storage on your device — they are not uploaded to our servers or shared with third parties.</InfoParagraph>
      <InfoParagraph>When you chat with Galaxy Bot, a summary of your ratings and saved movies is sent with your request so recommendations reflect your taste. This summary is not stored or linked to you.</InfoParagraph>
      <InfoParagraph>If you optionally join our alerts waitlist, we ask you to confirm your email address and store it solely to notify you when streaming alerts launch. Every email we send includes an unsubscribe link, and you can ask us to delete your address at any time via the contact page.</InfoParagraph>
      <InfoParagraph>We may receive standard technical information from hosting and security services, such as request timestamps, browser type, and approximate location. This information is used to operate and protect the site.</InfoParagraph>
      <InfoParagraph>If analytics or outbound-click measurement is added, it will use aggregated, privacy-conscious events and will not include movie search terms or personal identifiers.</InfoParagraph>
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
