import { NextRequest, NextResponse } from 'next/server'
import { checkCrawlerBudget } from './lib/crawlerThrottle'

export async function middleware(req: NextRequest) {
  if (await checkCrawlerBudget(req.headers.get('user-agent'))) return NextResponse.next()
  return new NextResponse('Too Many Requests', {
    status: 429,
    headers: { 'Retry-After': '300' }
  })
}

// Files (robots.txt, sitemap.xml, /leaving.xml, assets) must stay reachable by
// every crawler, and /api/* has its own per-endpoint budgets.
export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
}
