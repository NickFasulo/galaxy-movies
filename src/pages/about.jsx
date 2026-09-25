import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'

export default function About() {
  return (
    <InfoPage title='About Galaxy Movies' description='Learn about Galaxy Movies and its movie discovery features.'>
      <InfoParagraph>Galaxy Movies helps people discover popular, new, and upcoming movies in one place.</InfoParagraph>
      <InfoParagraph>Movie information and availability data are supplied by The Movie Database. Availability may vary by country and can change over time.</InfoParagraph>
      <a href="https://launchaf.com/" target="_blank" rel="noopener" data-launchaf-badge="true"><img src="https://launchaf.com/api/badge/light?v=launchaf-blue-2026-2" alt="Featured on LaunchAF" width="200" height="56" /></a>
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
