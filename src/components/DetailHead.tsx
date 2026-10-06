import Head from 'next/head'
import BreadcrumbSchema, { type BreadcrumbItem } from './BreadcrumbSchema'
import HreflangTags from './HreflangTags'
import { buildTrailerSchema } from '../utils/schema'

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

export default function DetailHead({
  pageTitle,
  description,
  canonicalUrl,
  ogType,
  ogImage,
  structuredData,
  trailer,
  breadcrumbItems
}: {
  pageTitle: string
  description: string
  canonicalUrl: string
  ogType: 'video.movie' | 'video.tv_show'
  ogImage: string
  structuredData: Record<string, unknown>
  trailer: { title: string; uploadDate?: string; thumbnailUrl: string; videoKey: string } | null
  breadcrumbItems: BreadcrumbItem[]
}) {
  return (
    <Head>
      <title>{pageTitle}</title>
      <meta name='description' content={description} />
      <link rel='canonical' href={canonicalUrl} />
      <HreflangTags canonicalUrl={canonicalUrl} />

      <meta property='og:type' content={ogType} />
      <meta property='og:site_name' content='Galaxy Movies' />
      <meta property='og:locale' content='en_US' />
      <meta property='og:title' content={pageTitle} />
      <meta property='og:description' content={description} />
      <meta property='og:url' content={canonicalUrl} />
      <meta property='og:image' content={ogImage} />
      <meta property='og:image:width' content='1200' />
      <meta property='og:image:height' content='630' />

      <meta name='twitter:card' content='summary_large_image' />
      <meta name='twitter:title' content={pageTitle} />
      <meta name='twitter:description' content={description} />
      <meta name='twitter:image' content={ogImage} />

      <JsonLd data={structuredData} />
      {trailer && <JsonLd data={buildTrailerSchema(trailer)} />}
      <BreadcrumbSchema items={breadcrumbItems} />
    </Head>
  );
}
