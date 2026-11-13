import InfoPage, { InfoParagraph } from '../components/InfoPage'
import Link from 'next/link'

export default function About() {
  return (
    <InfoPage title='About Galaxy Movies' description='Learn about Galaxy Movies and its movie discovery features.' withBackButton>
      <InfoParagraph>
        Galaxy Movies tracks every arrival and departure across streaming services, daily — so you
        always know what&apos;s new, what&apos;s leaving, and where to watch. Keep a list, rate what you see,
        and get alerts before titles disappear from your services. No account needed; your data lives
        on your device.
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
    </InfoPage>
  )
}

export async function getStaticProps() {
  return {
    props: {},
    revalidate: 86400
  }
}