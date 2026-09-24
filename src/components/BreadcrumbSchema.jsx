/**
 * BreadcrumbSchema Component
 * Generates structured data for breadcrumb navigation
 * @param {Array} items - Array of breadcrumb items with name and url
 * @returns {JSX.Element} Script tag with JSON-LD structured data
 */
export default function BreadcrumbSchema({ items }) {
  if (!items || items.length === 0) return null

  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url
    }))
  }

  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(breadcrumbData).replace(/</g, '\\u003c')
      }}
    />
  )
}
