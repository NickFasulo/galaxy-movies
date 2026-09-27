import InfoPage, { InfoParagraph } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Flex } from '@chakra-ui/react'

export default function About() {
  return (
    <InfoPage title='About Galaxy Movies' description='Learn about Galaxy Movies and its movie discovery features.'>
      <InfoParagraph>
        Galaxy Movies helps people discover popular, new, and upcoming movies in one place.
      </InfoParagraph>
      <InfoParagraph>
        Movie information and availability data are supplied by The Movie Database. Availability may vary by country and can change over time.
      </InfoParagraph>
      <Flex wrap="wrap" gap="1.5rem" alignItems="center" mb={4}>
        <a href="https://launchaf.com/" target="_blank" rel="noopener" data-launchaf-badge="true">
          <img src="https://launchaf.com/api/badge/light?v=launchaf-blue-2026-2" alt="Featured on LaunchAF" width="200" height="56" />
        </a>
        <a href="https://www.shipnlaunch.com/" target="_blank" rel="noopener noreferrer">
          <img src="https://www.shipnlaunch.com/badges/featured-dark.svg" alt="Featured on ShipNLaunch" width="240" height="56" />
        </a>
      </Flex>
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