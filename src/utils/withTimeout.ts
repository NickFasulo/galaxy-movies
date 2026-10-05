// Bounds optional SSR work (OpenAI, oEmbed) so a slow call degrades to a
// fallback instead of pushing the function past Vercel's invocation limit.
export function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms))
  ])
}
