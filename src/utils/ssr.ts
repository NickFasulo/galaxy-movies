import type { GetServerSidePropsContext } from 'next'

type SsrResponse = GetServerSidePropsContext['res']

export function setSwrCache(res: SsrResponse, sMaxage = 86400, staleWhileRevalidate = 604800) {
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxage}, stale-while-revalidate=${staleWhileRevalidate}`)
}
