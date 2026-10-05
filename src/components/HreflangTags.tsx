// All hreflang entries point to the same URL intentionally — regional
// differences are rendered server-side, not via separate locale URLs.
export default function HreflangTags({ canonicalUrl }: { canonicalUrl?: string | null }) {
  if (!canonicalUrl) return null

  return (
    <>
      <link rel='alternate' hrefLang='en-US' href={canonicalUrl} />
      <link rel='alternate' hrefLang='en-IN' href={canonicalUrl} />
      <link rel='alternate' hrefLang='x-default' href={canonicalUrl} />
    </>
  )
}
