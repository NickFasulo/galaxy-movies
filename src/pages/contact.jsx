import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'

export default function Contact() {
  return (
    <InfoPage title='Contact Galaxy Movies' description='Contact Galaxy Movies about corrections, feedback, or business inquiries.'>
      <InfoParagraph>For corrections, accessibility feedback, or partnership inquiries, contact the site owner through the email address associated with the Galaxy Movies project.</InfoParagraph>
      <InfoParagraph>Please include the movie title and page URL when reporting inaccurate movie information or availability.</InfoParagraph>
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
