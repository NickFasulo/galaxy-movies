/**
 * HreflangTags Component
 * Emits hreflang alternates for a canonical URL that serves the same English
 * content to both US and India audiences (region-aware rendering happens
 * server-side; the URL itself doesn't change per locale).
 * @param {string} canonicalUrl - The canonical URL for the current page
 */
export default function HreflangTags({ canonicalUrl }) {
  if (!canonicalUrl) return null

  return (
    <>
      <link rel='alternate' hrefLang='en-US' href={canonicalUrl} />
      <link rel='alternate' hrefLang='en-IN' href={canonicalUrl} />
      <link rel='alternate' hrefLang='x-default' href={canonicalUrl} />
    </>
  )
}
