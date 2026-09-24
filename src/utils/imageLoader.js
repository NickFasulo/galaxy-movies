export default function imageLoader({ src, width, quality }) {
  // Handle local images or non-TMDB URLs
  if (!src.startsWith('/')) {
    return src
  }

  // Map requested width to TMDB size endpoints
  // TMDB available sizes: w92, w154, w185, w342, w500, w780, w1280, original
  let tmdbSize = 'w500' // default
  
  if (width <= 92) {
    tmdbSize = 'w92'
  } else if (width <= 154) {
    tmdbSize = 'w154'
  } else if (width <= 185) {
    tmdbSize = 'w185'
  } else if (width <= 342) {
    tmdbSize = 'w342'
  } else if (width <= 500) {
    tmdbSize = 'w500'
  } else if (width <= 780) {
    tmdbSize = 'w780'
  } else if (width <= 1280) {
    tmdbSize = 'w1280'
  } else {
    tmdbSize = 'original'
  }

  // Construct TMDB URL with appropriate size
  return `https://image.tmdb.org/t/p/${tmdbSize}${src}`
}
