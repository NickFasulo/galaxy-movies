import InfoPage, { InfoParagraph } from '../components/InfoPage'

export default function About() {
  return (
    <InfoPage title='About Galaxy Movies' description='Learn about Galaxy Movies and its movie discovery features.'>
      <InfoParagraph>Galaxy Movies helps people discover popular, new, and upcoming movies in one place.</InfoParagraph>
      <InfoParagraph>Movie information and availability data are supplied by The Movie Database. Availability may vary by country and can change over time.</InfoParagraph>
    </InfoPage>
  )
}
