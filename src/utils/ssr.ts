import type { GetServerSidePropsContext } from 'next'

type SsrResponse = GetServerSidePropsContext['res']

export function setSwrCache(res: SsrResponse, sMaxage = 3600, staleWhileRevalidate = 86400) {
  res.setHeader('Cache-Control', `public, s-maxage=${sMaxage}, stale-while-revalidate=${staleWhileRevalidate}`)
}
