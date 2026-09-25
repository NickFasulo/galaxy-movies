import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'

export default function Disclosure() {
  return (
    <InfoPage
      title='Affiliate Disclosure'
      description='Learn how Galaxy Movies may earn commission from qualifying links.'
    >
      <InfoParagraph>
        Galaxy Movies may use affiliate links to streaming, rental, purchase,
        or ticketing services. If you follow one of those links and complete
        a qualifying purchase or subscription, we may earn a commission at no
        additional cost to you.
      </InfoParagraph>
      <InfoParagraph>
        Provider availability and pricing can change. We do not accept
        payment for editorial ratings or movie information.
      </InfoParagraph>
      <BackButton />
    </InfoPage>
  )
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}