import { SITE_URL } from './site'

const apiBase = () => (process.env.POLAR_API_BASE || 'https://api.polar.sh').replace(/\/$/, '')

export function polarConfigured(): boolean {
  return Boolean(process.env.POLAR_ACCESS_TOKEN)
}

export async function polarPost<T>(path: string, body: unknown): Promise<T | null> {
  const token = process.env.POLAR_ACCESS_TOKEN
  if (!token) return null
  try {
    const resp = await fetch(`${apiBase()}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
    if (!resp.ok) {
      console.error(`Polar ${path} failed: ${resp.status}`)
      return null
    }
    return (await resp.json()) as T
  } catch (err) {
    console.error(`Polar ${path} error:`, err)
    return null
  }
}

export function productForPlan(plan: unknown): string | undefined {
  return plan === 'yearly' ? process.env.POLAR_PRODUCT_YEARLY : process.env.POLAR_PRODUCT_MONTHLY
}

export const PLUS_SUCCESS_URL = `${SITE_URL}/plus?status=success`
