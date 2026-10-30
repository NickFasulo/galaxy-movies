import type { ReactNode } from 'react'
import Head from 'next/head'
import { buildOgImageUrl } from '../features/catalog/schema'
import { SITE_URL } from '../lib/site'

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type='application/ld+json'
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c')
      }}
    />
  );
}

export interface BreadcrumbItem {
  name: string
  url: string
}

function BreadcrumbSchema({ items }: { items?: BreadcrumbItem[] }) {
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
  );
}

// All hreflang entries point to the same URL intentionally — regional
// differences are rendered server-side, not via separate locale URLs.
function HreflangTags({ canonicalUrl }: { canonicalUrl?: string | null }) {
  if (!canonicalUrl) return null

  return (
    <>
      <link rel='alternate' hrefLang='en-US' href={canonicalUrl} />
      <link rel='alternate' hrefLang='en-IN' href={canonicalUrl} />
      <link rel='alternate' hrefLang='x-default' href={canonicalUrl} />
    </>
  )
}

type StructuredData = Record<string, unknown> | null | undefined

export default function PageHead({
  title,
  description,
  canonicalUrl,
  titleSuffix = true,
  ogType = 'website',
  ogLocale = 'en_US',
  ogImage,
  ogTitle,
  socialTitle,
  ogSubtitle,
  posterPath,
  noindex = false,
  hreflang = true,
  structuredData,
  breadcrumbItems,
  children
}: {
  title: string
  description: string
  canonicalUrl?: string
  titleSuffix?: boolean
  ogType?: string
  ogLocale?: string
  ogImage?: string
  ogTitle?: string
  socialTitle?: string
  ogSubtitle?: string
  posterPath?: string | null
  noindex?: boolean
  hreflang?: boolean
  structuredData?: StructuredData | StructuredData[]
  breadcrumbItems?: BreadcrumbItem[]
  children?: ReactNode
}) {
  const pageTitle = titleSuffix ? `${title} | Galaxy Movies` : title
  const previewTitle = socialTitle || pageTitle
  const image = ogImage || buildOgImageUrl({
    siteUrl: SITE_URL,
    title: ogTitle || title,
    subtitle: ogSubtitle || description,
    posterPath: posterPath || null
  })
  const schemas = (Array.isArray(structuredData) ? structuredData : [structuredData])
    .filter((data): data is Record<string, unknown> => Boolean(data))

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name='description' content={description} />
      {noindex && <meta name='robots' content='noindex,follow' />}
      {canonicalUrl && <link rel='canonical' href={canonicalUrl} />}
      {hreflang && <HreflangTags canonicalUrl={canonicalUrl} />}

      <meta property='og:type' content={ogType} />
      <meta property='og:site_name' content='Galaxy Movies' />
      <meta property='og:locale' content={ogLocale} />
      <meta property='og:title' content={previewTitle} />
      <meta property='og:description' content={description} />
      {canonicalUrl && <meta property='og:url' content={canonicalUrl} />}
      <meta property='og:image' content={image} />
      <meta property='og:image:width' content='1200' />
      <meta property='og:image:height' content='630' />

      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={previewTitle} />
      <meta name='twitter:description' content={description} />
      <meta name='twitter:image' content={image} />

      {schemas.map((data, index) => (
        <JsonLd key={index} data={data} />
      ))}
      <BreadcrumbSchema items={breadcrumbItems} />
      {children}
    </Head>
  );
}
