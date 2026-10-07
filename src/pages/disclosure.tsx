import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Box } from '@chakra-ui/react'

export default function Disclosure() {
  return (
    <InfoPage
      title='Affiliate Disclosure'
      description='Learn how Galaxy Movies may earn commission from qualifying links.'
    >
      <InfoParagraph>
        Some outbound links on Galaxy Movies are affiliate links — including
        &quot;where to watch&quot; links to streaming, rental, and purchase
        providers (monetized through the Takeads affiliate network) and links
        to VPN services such as NordVPN. If you follow one of those links
        and complete a qualifying purchase or subscription, we may earn a
        commission at no additional cost to you. When a link has no affiliate
        offer, it leads directly to the provider.
      </InfoParagraph>
      <InfoParagraph>
        Provider availability and pricing can change. Affiliate partnerships
        never influence which providers we list, and we do not accept payment
        for editorial ratings or movie information.
      </InfoParagraph>
      <InfoParagraph>
        As an Amazon Associate, Galaxy Movies may earn from qualifying
        purchases.
      </InfoParagraph>
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