import InfoPage, { InfoParagraph } from '../components/InfoPage'

export default function Privacy() {
  return (
    <InfoPage title='Privacy Policy' description='Read the Galaxy Movies privacy policy.'>
      <InfoParagraph>Galaxy Movies does not require an account and does not intentionally collect names, email addresses, or payment information.</InfoParagraph>
      <InfoParagraph>We may receive standard technical information from hosting and security services, such as request timestamps, browser type, and approximate location. This information is used to operate and protect the site.</InfoParagraph>
      <InfoParagraph>If analytics or outbound-click measurement is added, it will use aggregated, privacy-conscious events and will not include movie search terms or personal identifiers.</InfoParagraph>
    </InfoPage>
  )
}
