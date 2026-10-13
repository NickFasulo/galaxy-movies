import type { GetServerSidePropsContext } from 'next'

type SsrResponse = GetServerSidePropsContext['res']

export function setSwrCache(res: SsrResponse, sMaxage = 86400, staleWhileRevalidate = 604800) {
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxage}, stale-while-revalidate=${staleWhileRevalidate}`)
}

// ?page=N support: infinite-scroll pages SSR deep pages so crawlers can
// reach content past page 1 (Google's paginated-URL guidance).
export function getPageParam(query: GetServerSidePropsContext['query']) {
  const raw = Array.isArray(query.page) ? query.page[0] : query.page
  return { page: Math.max(1, Math.floor(Number(raw)) || 1), requested: raw !== undefined }
}
