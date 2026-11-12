import InfoPage, { InfoParagraph } from '../components/InfoPage'
import Link from 'next/link'
import { Flex } from '@chakra-ui/react'

export default function About() {
  return (
    <InfoPage title='About Galaxy Movies' description='Learn about Galaxy Movies and its movie discovery features.' withBackButton>
      <InfoParagraph>
        Galaxy Movies helps people discover popular, new, and upcoming movies in one place — and keep
        track of them: save what you want to see, mark what you have watched, and get alerts when
        titles land on or leave your services, all without an account.
      </InfoParagraph>
      <InfoParagraph>
        Movie, TV information, and watch-provider availability are supplied by The Movie Database (TMDB). Rental and purchase prices, provider deep links, and streaming catalog changes are supplied by Watchmode. Availability may vary by country and can change over time.
      </InfoParagraph>
      <InfoParagraph>
        Optional Trakt account sync and the watch activity charts on our <Link href='/reports'
        style={{ textDecoration: 'underline' }}>reports page</Link> are powered by
        Trakt. Galaxy Movies uses Trakt but is not endorsed or certified by Trakt.
      </InfoParagraph>
      <InfoParagraph>
        See the data we track in the <Link href='/reports' style={{ textDecoration: 'underline' }}>streaming reports</Link>, or compare us to{' '}
        <Link href='/justwatch-alternative' style={{ textDecoration: 'underline' }}>JustWatch</Link>,{' '}
        <Link href='/reelgood-alternative' style={{ textDecoration: 'underline' }}>Reelgood</Link>,{' '}
        <Link href='/trakt-alternative' style={{ textDecoration: 'underline' }}>Trakt</Link>,{' '}
        <Link href='/tv-time-alternative' style={{ textDecoration: 'underline' }}>TV Time</Link>,{' '}
        <Link href='/imdb-alternative' style={{ textDecoration: 'underline' }}>IMDb</Link>, or{' '}
        <Link href='/whats-on-netflix-alternative' style={{ textDecoration: 'underline' }}>What&apos;s on Netflix</Link>.
      </InfoParagraph>
      <Flex wrap="wrap" gap="1.5rem" alignItems="center" justify={{ base: 'center', md: 'flex-start' }} my='2rem'>
        <a href="https://launchaf.com/" target="_blank" rel="noopener" data-launchaf-badge="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://launchaf.com/api/badge/light?v=launchaf-blue-2026-2" alt="Featured on LaunchAF" width="200" height="56" />
        </a>
        <a href="https://www.shipnlaunch.com/" target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.shipnlaunch.com/badges/featured-dark.svg" alt="Featured on ShipNLaunch" width="240" height="56" />
        </a>
        <a href="https://openhunts.com" target="_blank" title="OpenHunts Club">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="OpenHunts Club Member" src="https://cdn.openhunts.com/badges/club.webp" width="195" height="auto" />
        </a>
      </Flex>
    </InfoPage>
  )
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}