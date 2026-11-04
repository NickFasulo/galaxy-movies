import type { ReactNode } from 'react'
import Head from 'next/head'
import { buildOgImageUrl } from '../features/catalog/schema'
import { SITE_URL } from '../lib/site'

function JsonLd({ data }: { data: Record<string, unknown> }) {
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

export interface HreflangAlternates {
  us?: string
  in?: string
}

// Without alternates, all entries point to the same URL — regional
// differences are rendered server-side, not via separate locale URLs.
// Pages with an /in/ counterpart pass real alternates: en-IN targets the
// region-pinned /in/ URL Google can crawl (Googlebot sends no geo headers,
// so it would otherwise only ever index the US render).
function HreflangTags({ canonicalUrl, alternates }: { canonicalUrl?: string | null; alternates?: HreflangAlternates }) {
  // When alternates are given, emit exactly what's provided — an IN-only page
  // must not fall back to its canonical for en-US. No alternates = legacy
  // same-URL tags.
  const us = alternates ? alternates.us : canonicalUrl
  const inUrl = alternates ? alternates.in : canonicalUrl
  if (!us && !inUrl) return null

  return (
    <>
      {us && <link rel='alternate' hrefLang='en-US' href={us} />}
      {inUrl && <link rel='alternate' hrefLang='en-IN' href={inUrl} />}
      <link rel='alternate' hrefLang='x-default' href={us ?? inUrl!} />
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
  backdropPath,
  noindex = false,
  hreflang = true,
  hreflangAlternates,
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
  backdropPath?: string | null
  noindex?: boolean
  hreflang?: boolean
  hreflangAlternates?: HreflangAlternates
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
    posterPath: posterPath || null,
    backdropPath: backdropPath || null
  })
  const schemas = (Array.isArray(structuredData) ? structuredData : [structuredData])
    .filter((data): data is Record<string, unknown> => Boolean(data))

  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name='description' content={description} />
      {/* max-image-preview:large opts every page into large Discover/image
          previews — Google's default image preview is thumbnail-sized. */}
      <meta name='robots' content={noindex ? 'noindex,follow' : 'max-image-preview:large'} />
      {canonicalUrl && <link rel='canonical' href={canonicalUrl} />}
      {hreflang && <HreflangTags canonicalUrl={canonicalUrl} alternates={hreflangAlternates} />}

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
