import Link from 'next/link'
import InfoPage, { InfoParagraph, InfoHeading } from '../components/InfoPage'
import BackButton from '../components/BackButton'
import { Box, ListItem, UnorderedList } from '@chakra-ui/react'

export default function Privacy() {
  return (
    <InfoPage title='Privacy Policy' description='Read the Galaxy Movies privacy policy.'>
      <InfoParagraph><em>Last updated: October 6, 2026</em></InfoParagraph>
      <InfoParagraph>
        Galaxy Movies (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates galaxymovies.app (the
        &quot;Service&quot;), a movie and TV discovery site with streaming availability information and an
        AI recommendation assistant. This Privacy Policy explains what information we collect, how we
        use it, who we share it with, and the choices you have. The Service is designed to work
        without an account, so we collect as little personal data as possible.
      </InfoParagraph>

      <InfoHeading>1. Information We Collect</InfoHeading>
      <InfoParagraph><strong>Data stored on your device.</strong> Galaxy Movies does not require an
        account. Your saved movies, ratings, and streaming service preferences are stored only in
        your browser&apos;s local storage on your device — they are not uploaded to our servers or
        shared with third parties. You can delete this data at any time by clearing your browser
        storage.</InfoParagraph>
      <InfoParagraph><strong>Email address (optional).</strong> If you optionally join our alerts
        waitlist, we ask you to confirm your email address and store it solely to notify you when
        streaming alerts launch.</InfoParagraph>
      <InfoParagraph><strong>Contact form submissions.</strong> If you contact us through the contact
        page, we receive the name, email address, and message you submit so we can respond.</InfoParagraph>
      <InfoParagraph><strong>Chat messages.</strong> When you chat with Galaxy Bot, the messages you
        send and a summary of your ratings and saved movies (your &quot;taste profile&quot;) are sent
        with your request so recommendations reflect your taste. This summary is not stored or linked
        to you.</InfoParagraph>
      <InfoParagraph><strong>Technical and usage data.</strong> We may receive standard technical
        information from hosting and security services, such as IP address, request timestamps,
        browser type, and approximate location. This information is used to operate, secure, and
        rate-limit the Service.</InfoParagraph>
      <InfoParagraph><strong>Anonymous analytics.</strong> We use Vercel Analytics to measure
        aggregated page views and performance. These events do not include movie search terms or
        personal identifiers. We also record anonymous, aggregated Galaxy Bot usage statistics (such
        as message counts, session duration, and feature usage) to monitor performance and cost.</InfoParagraph>

      <InfoHeading>2. How We Use Your Information</InfoHeading>
      <UnorderedList mb={4} pl={4} spacing={1}>
        <ListItem>To provide and operate the Service, including search, streaming availability, and recommendations</ListItem>
        <ListItem>To generate personalized Galaxy Bot responses based on the messages and taste profile you send</ListItem>
        <ListItem>To send waitlist confirmation and notification emails you have signed up for</ListItem>
        <ListItem>To respond to corrections, feedback, and inquiries sent through the contact form</ListItem>
        <ListItem>To analyze aggregated traffic and usage so we can improve the Service</ListItem>
        <ListItem>To protect the Service through rate limiting and abuse prevention</ListItem>
      </UnorderedList>

      <InfoHeading>3. Cookies and Local Storage</InfoHeading>
      <InfoParagraph>
        Galaxy Movies does not set tracking cookies. We use your browser&apos;s local storage to keep
        your watchlist, ratings, and service preferences on your device, and to remember an
        analytics opt-out preference. You can opt out of analytics at any time by setting
        a <code>disableAnalytics</code> flag in your browser&apos;s local storage, and you can manage
        or clear cookies and site data through your browser settings.
      </InfoParagraph>
      <InfoParagraph>
        Third parties involved in the Service may set their own cookies — for example, affiliate
        redirect services that attribute clicks, or embedded video players. Those cookies are governed
        by the third party&apos;s own privacy policy.
      </InfoParagraph>

      <InfoHeading>4. Affiliate Links and Third-Party Tracking</InfoHeading>
      <InfoParagraph>
        Some outbound &quot;where to watch&quot; links route through affiliate redirect services —
        including the Takeads affiliate network and Amazon Associates — which record the click for
        commission attribution. These services may set cookies or use similar technologies to track
        whether a click led to a qualifying purchase. See our <Link href='/disclosure'>affiliate
        disclosure</Link> for details.
      </InfoParagraph>

      <InfoHeading>5. Third-Party Services We Use</InfoHeading>
      <InfoParagraph>To operate the Service we rely on the following providers, each of which
        processes data under its own privacy policy:</InfoParagraph>
      <UnorderedList mb={4} pl={4} spacing={1}>
        <ListItem><strong>Vercel</strong> — hosting, request logs, and aggregated analytics</ListItem>
        <ListItem><strong>Upstash</strong> — server-side storage for the waitlist and anonymous usage statistics</ListItem>
        <ListItem><strong>OpenAI</strong> — generates Galaxy Bot responses from your messages and taste profile</ListItem>
        <ListItem><strong>Resend</strong> — delivers waitlist confirmation and notification emails</ListItem>
        <ListItem><strong>Web3Forms</strong> — delivers contact form submissions to us</ListItem>
        <ListItem><strong>TMDB and Watchmode</strong> — supply movie metadata and streaming availability</ListItem>
        <ListItem><strong>YouTube</strong> — embedded trailers (loaded via the youtube-nocookie.com domain)</ListItem>
      </UnorderedList>
      <InfoParagraph>
        Movie poster and backdrop images are served directly from TMDB&apos;s image servers, so your
        browser discloses standard request data (such as IP address and browser type) to them when
        loading those images. Streaming provider sites you visit through our links are governed by
        their own privacy policies.
      </InfoParagraph>

      <InfoHeading>6. Data Retention</InfoHeading>
      <UnorderedList mb={4} pl={4} spacing={1}>
        <ListItem>Watchlist, ratings, and preferences: stored only on your device until you clear them</ListItem>
        <ListItem>Waitlist email addresses: kept until alerts launch and we notify you, or until you ask us to delete your address</ListItem>
        <ListItem>Galaxy Bot anonymous session statistics: retained for up to 30 days; optional feedback for up to 90 days</ListItem>
        <ListItem>Chat responses may be cached server-side for up to 30 minutes to improve performance</ListItem>
        <ListItem>Hosting and security logs: retained by Vercel under their standard retention periods</ListItem>
      </UnorderedList>

      <InfoHeading>7. Your Rights and Choices</InfoHeading>
      <InfoParagraph>
        Depending on where you live, you may have rights under laws such as the GDPR or CCPA,
        including the right to access, correct, or delete the personal data we hold about you, to
        withdraw consent, and to lodge a complaint with your local data protection authority.
        Because most of your data never leaves your device, the information we hold is generally
        limited to your waitlist email address and contact form messages — you can ask us to access
        or delete these at any time via the <Link href='/contact'>contact page</Link>. Every email we
        send includes an unsubscribe link.
      </InfoParagraph>

      <InfoHeading>8. Data Security</InfoHeading>
      <InfoParagraph>
        The Service is served over HTTPS, and access to server-side storage is restricted and
        rate-limited. No method of transmission or storage is completely secure, but collecting as
        little data as possible — and keeping personal data on your device by default — is our main
        safeguard.
      </InfoParagraph>

      <InfoHeading>9. Children&apos;s Privacy</InfoHeading>
      <InfoParagraph>
        The Service is not directed at children under 13, and we do not knowingly collect personal
        information from children. If you believe a child has provided us personal information,
        contact us and we will delete it.
      </InfoParagraph>

      <InfoHeading>10. Changes to This Policy</InfoHeading>
      <InfoParagraph>
        We may update this Privacy Policy from time to time. Changes will be posted on this page
        with an updated date, and continued use of the Service after changes take effect constitutes
        acceptance of the updated policy.
      </InfoParagraph>

      <InfoHeading>11. Contact Us</InfoHeading>
      <InfoParagraph>
        If you have questions about this Privacy Policy or want to exercise your data rights, reach
        us through the <Link href='/contact'>contact page</Link>.
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
