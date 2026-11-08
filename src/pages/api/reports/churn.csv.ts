import type { NextApiRequest, NextApiResponse } from 'next'
import { buildChurnRows, getYearlyChanges } from '../../../features/catalog/streamingChanges'
import { setSwrCache } from '../../../lib/http'

// Long-format dump of the provider×month churn grid backing
// /reports/streaming-churn — press and researchers want tables, not
// screenshots. Public read-only derived data, same stance as
// /api/streaming-changes.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const year = typeof req.query.year === 'string' && /^\d{4}$/.test(req.query.year)
    ? req.query.year
    : new Date().toISOString().slice(0, 4)

  try {
    const rows = buildChurnRows(await getYearlyChanges('US', year))
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = ['provider,month,arrived,departed,net']
    for (const r of rows) {
      for (const m of Object.keys(r.months).sort()) {
        const c = r.months[m]
        lines.push([esc(r.label), m, c.arrived, c.departed, c.net].join(','))
      }
    }
    setSwrCache(res, 21600)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.status(200).send(lines.join('\n'))
  } catch (err) {
    console.error('churn.csv failed:', err)
    res.status(502).json({ error: 'Churn data temporarily unavailable' })
  }
}
