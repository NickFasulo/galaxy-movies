// Bounds optional SSR work (OpenAI, oEmbed) so a slow call degrades to a
// fallback instead of pushing the function past Vercel's invocation limit.
export function withTimeout<T, F = T>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return Promise.race([
    promise,
    new Promise<F>((resolve) => setTimeout(() => resolve(fallback), ms))
  ])
}
