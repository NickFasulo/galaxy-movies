import type { ReactNode } from 'react'
import Head from 'next/head'
import BreadcrumbSchema, { type BreadcrumbItem } from './BreadcrumbSchema'
import HreflangTags from './HreflangTags'
import { buildOgImageUrl } from '../utils/schema'
import { SITE_URL } from '../utils/site'

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
  ogSubtitle?: string
  posterPath?: string | null
  noindex?: boolean
  hreflang?: boolean
  structuredData?: StructuredData | StructuredData[]
  breadcrumbItems?: BreadcrumbItem[]
  children?: ReactNode
}) {
  const pageTitle = titleSuffix ? `${title} | Galaxy Movies` : title
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
      <meta property='og:title' content={pageTitle} />
      <meta property='og:description' content={description} />
      {canonicalUrl && <meta property='og:url' content={canonicalUrl} />}
      <meta property='og:image' content={image} />
      <meta property='og:image:width' content='1200' />
      <meta property='og:image:height' content='630' />

      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={pageTitle} />
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
